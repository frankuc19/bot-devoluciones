const { Router } = require('express');
const multer     = require('multer');
const path       = require('path');
const fs         = require('fs');
const { v4: uuidv4 } = require('uuid');
const XLSX       = require('xlsx');
const { personalize, sleep } = require('./emailService');
const { saveCampaign }       = require('./campaigns');

const UPLOADS_DIR = path.join(__dirname, '../../uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOADS_DIR),
  filename:    (_, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`),
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

const router = Router();

// Parsear contactos xlsx/csv
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

// Enviar campaña WA masiva (usa el waClient compartido del servidor)
router.post('/send', (req, res) => {
  const io = req.app.get('io');
  const waClient = req.app.get('waClient');
  const { contactsTempId, name, message, phoneColumn, delay = 2500 } = req.body;

  const contactsPath = path.join(UPLOADS_DIR, contactsTempId);
  if (!fs.existsSync(contactsPath)) return res.status(400).json({ error: 'Archivo temporal no encontrado' });

  const wb       = XLSX.readFile(contactsPath);
  const ws       = wb.Sheets[wb.SheetNames[0]];
  const contacts = XLSX.utils.sheet_to_json(ws, { defval: '' });

  const campaignId = uuidv4();
  const campaign = {
    id: campaignId, name, type: 'whatsapp', status: 'sending',
    createdAt: new Date().toISOString(),
    config: { message, phoneColumn, delay },
    stats: { total: contacts.length, sent: 0, failed: 0, read: 0 },
  };
  saveCampaign(campaign);
  res.json({ campaignId, total: contacts.length });

  (async () => {
    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];
      const msg     = personalize(message, contact);
      const phone   = String(contact[phoneColumn] || '').replace(/\D/g, '');
      try {
        if (!phone) throw new Error('Sin número');
        if (!waClient) throw new Error('WhatsApp no conectado');
        await waClient.sendMessage(`${phone}@s.whatsapp.net`, { text: msg });
        campaign.stats.sent++;
      } catch {
        campaign.stats.failed++;
      }
      io?.emit('ob:wa:progress', { campaignId, sent: campaign.stats.sent, failed: campaign.stats.failed, total: contacts.length, idx: i });
      saveCampaign(campaign);
      if (i < contacts.length - 1) await sleep(Number(delay));
    }
    campaign.status = 'completed';
    saveCampaign(campaign);
    io?.emit('campaign:complete', { campaignId, stats: campaign.stats });
  })();
});

module.exports = router;
