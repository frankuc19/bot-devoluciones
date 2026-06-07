function personalize(template, variables) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    variables[key] !== undefined ? String(variables[key]) : `{{${key}}}`
  );
}

function extractVariables(template) {
  const matches = template.match(/\{\{(\w+)\}\}/g) || [];
  return [...new Set(matches.map(m => m.slice(2, -2)))];
}

async function sendViaWebhook(webhookUrl, payload) {
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Webhook respondió ${res.status}: ${res.statusText}`);
  return res.json().catch(() => ({}));
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { personalize, extractVariables, sendViaWebhook, sleep };
