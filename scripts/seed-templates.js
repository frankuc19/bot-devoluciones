// Ejecutar: node scripts/seed-templates.js
const fs   = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const LOGO = 'https://res.cloudinary.com/dkkab5dea/image/upload/v1778254790/guphgo6mzpq46e71nk0f.png';
const TPL_FILE = path.join(__dirname, '../data/templates.json');

if (!fs.existsSync(path.dirname(TPL_FILE))) fs.mkdirSync(path.dirname(TPL_FILE), { recursive: true });

// ─── Utilidad ────────────────────────────────────────────────────────────────
function t(id, name, html) {
  return { id, name, html, createdAt: new Date().toISOString() };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Agendamiento Semanal Falabella
// ─────────────────────────────────────────────────────────────────────────────
const htmlAgendamiento = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Agendamiento Semanal – Karri Falabella</title>
  <link href="https://fonts.googleapis.com/css2?family=Nunito+Sans:wght@400;600;700;800;900&family=Raleway:wght@700;800;900&display=swap" rel="stylesheet"/>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { background:#eef0f2; font-family:'Nunito Sans',sans-serif; color:#1f3444; -webkit-font-smoothing:antialiased; }
    .wrapper { max-width:620px; margin:32px auto; background:#fff; border-radius:20px; overflow:hidden; box-shadow:0 8px 48px rgba(31,52,68,0.13); }
    .top-strip { height:6px; background:linear-gradient(90deg,#1c9996 0%,#1f3444 60%,#1c9996 100%); }
    .header { background:#1f3444; padding:32px 40px 28px; display:flex; align-items:center; justify-content:space-between; }
    .header-badge { background:#1c9996; color:#fff; font-size:11px; font-weight:800; letter-spacing:1px; padding:6px 14px; border-radius:20px; text-transform:uppercase; }
    .hero { background:linear-gradient(135deg,#1c9996 0%,#1a8a87 100%); padding:36px 40px; text-align:center; }
    .hero-week { font-size:12px; font-weight:800; letter-spacing:2px; color:rgba(255,255,255,0.7); text-transform:uppercase; margin-bottom:8px; }
    .hero-title { font-family:'Raleway',sans-serif; font-size:26px; font-weight:900; color:#fff; margin-bottom:6px; line-height:1.2; }
    .hero-dates { display:inline-block; background:rgba(255,255,255,0.2); color:#fff; font-size:18px; font-weight:800; padding:8px 24px; border-radius:12px; margin-top:12px; letter-spacing:1px; }
    .body { padding:36px 40px; }
    .greeting { font-size:16px; font-weight:700; color:#1f3444; margin-bottom:16px; }
    .intro-text { font-size:15px; line-height:1.7; color:#3a5068; margin-bottom:24px; }
    .card { background:#f4f8fb; border-left:4px solid #1c9996; border-radius:12px; padding:20px 24px; margin-bottom:20px; }
    .card-title { font-size:13px; font-weight:800; letter-spacing:1px; text-transform:uppercase; color:#1c9996; margin-bottom:8px; }
    .card-text { font-size:14px; line-height:1.7; color:#3a5068; }
    .alert-card { background:#fff8e6; border-left:4px solid #f5a623; border-radius:12px; padding:20px 24px; margin-bottom:24px; display:flex; gap:14px; align-items:flex-start; }
    .alert-icon { font-size:22px; flex-shrink:0; }
    .alert-text { font-size:14px; line-height:1.6; color:#7a5500; font-weight:600; }
    .btn-wrap { text-align:center; margin:28px 0 20px; }
    .btn { display:inline-block; background:#1c9996; color:#fff !important; font-family:'Raleway',sans-serif; font-size:15px; font-weight:800; letter-spacing:1px; text-decoration:none; padding:16px 40px; border-radius:50px; box-shadow:0 6px 20px rgba(28,153,150,0.35); }
    .btn-sub { font-size:12px; text-align:center; color:#7a9ab0; margin-top:8px; }
    .closing { font-size:14px; line-height:1.7; color:#3a5068; margin-top:24px; padding-top:20px; border-top:1px solid #e8eef4; }
    .sig { margin-top:16px; font-weight:800; color:#1f3444; font-size:15px; }
    .footer { background:#1f3444; padding:20px 40px; display:flex; align-items:center; justify-content:space-between; }
    .footer-op { color:rgba(255,255,255,0.5); font-size:12px; margin-top:2px; }
    .footer-date { color:rgba(255,255,255,0.4); font-size:11px; }
    .bottom-strip { height:4px; background:linear-gradient(90deg,#1c9996,#1f3444); }
  </style>
</head>
<body>
<div class="wrapper">
  <div class="top-strip"></div>
  <div class="header">
    <img src="${LOGO}" alt="Karri" style="height:40px;"/>
    <div class="header-badge">Operación Falabella</div>
  </div>
  <div class="hero">
    <div class="hero-week">📅 Agendamiento Semanal</div>
    <div class="hero-title">Agenda tu disponibilidad<br/>para la próxima semana</div>
    <div class="hero-dates">{{semana}}</div>
  </div>
  <div class="body">
    <div class="greeting">Hola {{nombre}} 👋</div>
    <p class="intro-text">Como cada semana, llega tu recordatorio de agendamiento. Te pedimos que nos informes tu disponibilidad con anticipación para poder planificar la operación completa de la semana siguiente.</p>
    <div class="card">
      <div class="card-title">¿Por qué es importante agendar?</div>
      <div class="card-text">Contar con tu disponibilidad semanal nos permite planificar mejor las rutas, solicitar más servicios cuando sea necesario y asegurarnos de que tengas producción todos los días. Cuando agendas, <strong>tu cupo queda reservado</strong>.</div>
    </div>
    <div class="card">
      <div class="card-title">¿Cómo funciona?</div>
      <div class="card-text">Ingresa al formulario con tu <strong>RUT (ej: 1234567-8)</strong> e indica los días que estarás disponible. Todos los días se publicará la lista de personas que deben asistir con su horario y bodega asignada.</div>
    </div>
    <div class="alert-card">
      <div class="alert-icon">⚡</div>
      <div class="alert-text">¡Agenda lo antes posible! Los cupos se asignan por orden de disponibilidad. Entre antes respondas, mejor te podemos planificar.</div>
    </div>
    <div class="btn-wrap">
      <a href="https://form.typeform.com/to/mtAcgEkI" class="btn" target="_blank">Agendar mi disponibilidad →</a>
      <div class="btn-sub">Ingresa con tu RUT (ej: 1234567-8)</div>
    </div>
    <div class="closing">
      Ante cualquier consulta no dudes en comunicarte con tu coordinator o escribir al grupo. ¡Contamos contigo para una gran semana! 💪
      <div class="sig">Equipo Karri 🤝</div>
    </div>
  </div>
  <div class="footer">
    <div>
      <img src="${LOGO}" alt="Karri" style="height:28px;"/>
      <div class="footer-op">| Operaciones Falabella</div>
    </div>
    <div class="footer-date">{{fechaHoy}}</div>
  </div>
  <div class="bottom-strip"></div>
</div>
</body>
</html>`;

// ─────────────────────────────────────────────────────────────────────────────
// 2. Bono Cyber 2026 — Picker Tottus Piedra Roja
// ─────────────────────────────────────────────────────────────────────────────
const htmlPickerPiedraRoja = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Cyber 2026 – Picker Tottus Piedra Roja | Karri</title>
  <style>
    body{margin:0;padding:24px 16px;background:#f0f2f5;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;}
    .wrapper{max-width:640px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #d0d4da;}
    .header{background:#1f3444;padding:28px 36px;text-align:center;}
    .header img{height:52px;display:block;margin:0 auto;}
    .banner{background:#1c9996;padding:16px 36px;text-align:center;}
    .banner h1{margin:0;font-size:19px;font-weight:700;color:#fff;letter-spacing:0.5px;}
    .banner p{margin:6px 0 0;font-size:13px;color:rgba(255,255,255,0.85);}
    .body{padding:28px 36px;}
    .intro{font-size:15px;line-height:1.7;color:#2c2c2c;margin:0 0 22px;}
    .intro strong{color:#1c9996;}
    .bono-box{background:#1f3444;border-radius:10px;padding:22px 24px;text-align:center;margin-bottom:24px;}
    .bono-label{font-size:11px;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:1.2px;margin-bottom:6px;}
    .bono-amount{font-size:42px;font-weight:700;color:#1c9996;line-height:1;margin-bottom:6px;}
    .bono-sub{font-size:12px;color:rgba(255,255,255,0.65);margin-bottom:14px;line-height:1.6;}
    .bono-tag{display:inline-block;background:rgba(28,153,150,0.18);color:#1c9996;font-size:12px;padding:4px 14px;border-radius:20px;font-weight:600;margin:3px 4px;}
    .section-label{font-size:11px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:1.2px;margin:0 0 10px;}
    .sala-card{background:#fff;border:1px solid #e0e4ea;border-radius:8px;padding:14px 18px;display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;}
    .sala-card.especial{border:2px solid #4a9895;display:block;padding:0 16px 14px 16px;margin-top:16px;}
    .sala-badge-container{margin-top:-11px;margin-bottom:6px;text-align:left;}
    .sala-badge{background:#4a9895;color:#fff;font-size:10px;font-weight:700;padding:4px 12px;border-radius:20px;text-transform:uppercase;display:inline-block;line-height:1.2;}
    .sala-content{display:flex;justify-content:space-between;align-items:center;}
    .sala-nombre{font-size:16px;font-weight:700;color:#1f3444;margin-bottom:4px;}
    .sala-detalle{font-size:12px;color:#666;}
    .sala-detalle span{color:#4a9895;font-weight:700;}
    .sala-tarifa{font-size:22px;font-weight:700;color:#1f3444;white-space:nowrap;}
    .sala-card.especial .sala-tarifa{color:#4a9895;}
    .turnos-grid{display:flex;justify-content:space-between;width:100%;margin-bottom:24px;box-sizing:border-box;}
    .turno-card{width:48%;background:#f5f7fa;border:1px solid #e0e4ea;border-radius:8px;padding:14px;text-align:center;box-sizing:border-box;}
    .turno-label{font-size:20px;font-weight:700;color:#1c9996;margin-bottom:4px;}
    .turno-label.pm{color:#1f3444;}
    .turno-hora{font-size:12px;color:#666;}
    .turno-aviso{font-size:11px;color:#999;text-align:center;margin-top:8px;margin-bottom:24px;}
    .nota-tarifas{background:#f0f8f8;border-left:3px solid #1c9996;border-radius:4px;padding:10px 14px;font-size:12px;color:#555;margin-bottom:24px;line-height:1.6;}
    .cta-box{background:#1f3444;border-radius:10px;padding:24px;text-align:center;margin-bottom:20px;}
    .cta-box h2{margin:0 0 6px;font-size:17px;color:#fff;font-weight:700;}
    .cta-box p{margin:0 0 18px;font-size:13px;color:rgba(255,255,255,0.75);line-height:1.6;}
    .rut-instruccion{background:rgba(255,255,255,0.08);border:1px solid rgba(28,153,150,0.5);border-radius:8px;padding:10px 14px;font-size:12px;color:rgba(255,255,255,0.75);margin-bottom:18px;text-align:left;}
    .rut-instruccion strong{color:#1c9996;}
    .rut-ejemplo{font-family:monospace;font-size:15px;color:#fff;background:rgba(28,153,150,0.25);padding:2px 10px;border-radius:4px;}
    .btn-agendar{display:inline-block;background:#1c9996;color:#fff!important;text-decoration:none;font-size:16px;font-weight:700;padding:14px 36px;border-radius:8px;}
    .closing{font-size:13px;color:#666;line-height:1.7;margin:0;}
    .footer{background:#1f3444;padding:16px 36px;text-align:center;}
    .footer p{margin:0;font-size:11px;color:rgba(255,255,255,0.45);}
  </style>
</head>
<body>
<div class="wrapper">
  <div class="header"><img src="${LOGO}" alt="Karri"/></div>
  <div class="banner"><h1>🚨 BONO CYBER 2026 — PICKER TOTTUS PIEDRA ROJA 🚨</h1><p>Tarifa especial · Semana Cyber 2026 · Cupos limitados</p></div>
  <div class="body">
    <p class="intro">¡Hola <strong>{{nombre}}</strong>! El <strong>Cyber 2026</strong> arranca el <strong>1 de junio</strong> y tenemos operación de <strong>semana Cyber</strong> en Tottus Piedra Roja. Esta sala cuenta con <strong>tarifa especial</strong> — no pierdas el cupo y suma el bono Cyber.</p>
    <div class="bono-box">
      <p class="bono-label">Bono por día asistido · del 1 al 5 de junio 2026</p>
      <div class="bono-amount">+ $7.000</div>
      <p class="bono-sub">¡Entre más días asistas, mayor es tu bono! Máximo $35.000 en 5 días.</p>
      <span class="bono-tag">✅ Asistencia completa</span>
      <span class="bono-tag">✅ Jornada completa</span>
    </div>
    <p class="section-label">Turnos disponibles</p>
    <div class="turnos-grid">
      <div class="turno-card"><div class="turno-label">AM</div><div class="turno-hora">08:00 – 18:00 hrs</div></div>
      <div class="turno-card"><div class="turno-label pm">PM</div><div class="turno-hora">11:00 – 21:00 hrs</div></div>
    </div>
    <p class="turno-aviso">⚠ Cupos AM y PM limitados — agenda rápido</p>
    <p class="section-label">Salas y proyección de ingresos (6 días)</p>
    <div class="sala-card especial">
      <div class="sala-badge-container"><span class="sala-badge">Tarifa especial</span></div>
      <div class="sala-content">
        <div>
          <div class="sala-nombre">Tottus Piedra Roja</div>
          <div class="sala-detalle">$42.000/día · 6 días = <span>$252.000</span> + bono hasta <span>$35.000</span></div>
        </div>
        <div class="sala-tarifa">$42.000</div>
      </div>
    </div>
    <div class="nota-tarifas">💡 <strong>Tarifas brutas:</strong> los montos indicados corresponden al valor bruto por jornada. Los descuentos de ley se aplican según corresponda.</div>
    <div class="cta-box">
      <h2>¡Agéndate y no pierdas el cupo!</h2>
      <p>Genera ingresos esta semana en Karri.<br>Solo necesitas tu RUT para reservar.</p>
      <div class="rut-instruccion">📋 Completa tu <strong>RUT con guion</strong> y sin puntos.<br>Ejemplo: <span class="rut-ejemplo">1234567-8</span></div>
      <a href="https://form.typeform.com/to/zrElrTjy" class="btn-agendar" target="_blank">📅 &nbsp;Agenda tu cupo ahora</a>
    </div>
    <p class="closing">Recuerda presentarte puntual y con tu implementación completa. Cualquier consulta contáctate con tu coordinador/a de operaciones.</p>
  </div>
  <div class="footer"><p>Picker Tottus Piedra Roja · Operaciones Karri · Cyber 2026</p></div>
</div>
</body>
</html>`;

// ─────────────────────────────────────────────────────────────────────────────
// 3. Bono Cyber 2026 — Driver Tottus Calama
// ─────────────────────────────────────────────────────────────────────────────
const htmlDriverCalama = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Cyber 2026 – Driver Tottus Calama | Karri</title>
  <style>
    body{margin:0;padding:24px 16px;background:#f0f2f5;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;}
    .wrapper{max-width:640px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #d0d4da;}
    .header{background:#1f3444;padding:28px 36px;text-align:center;}
    .header img{height:52px;display:block;margin:0 auto;}
    .banner{background:#1c9996;padding:16px 36px;text-align:center;}
    .banner h1{margin:0;font-size:19px;font-weight:700;color:#fff;}
    .banner p{margin:6px 0 0;font-size:13px;color:rgba(255,255,255,0.85);}
    .body{padding:28px 36px;}
    .intro{font-size:15px;line-height:1.7;color:#2c2c2c;margin:0 0 22px;}
    .intro strong{color:#1c9996;}
    .bono-box{background:#1f3444;border-radius:10px;padding:22px 24px;text-align:center;margin-bottom:24px;}
    .bono-label{font-size:11px;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:1.2px;margin-bottom:6px;}
    .bono-amount{font-size:42px;font-weight:700;color:#1c9996;line-height:1;margin-bottom:6px;}
    .bono-sub{font-size:12px;color:rgba(255,255,255,0.65);margin-bottom:14px;line-height:1.6;}
    .bono-tag{display:inline-block;background:rgba(28,153,150,0.18);color:#1c9996;font-size:12px;padding:4px 14px;border-radius:20px;font-weight:600;margin:3px 4px;}
    .section-label{font-size:11px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:1.2px;margin:0 0 10px;}
    .info-box{background:#eef8f8;border-left:3px solid #1c9996;border-radius:4px;padding:12px 16px;font-size:13px;color:#2c2c2c;margin-bottom:24px;line-height:1.6;}
    .info-box strong{color:#1f3444;}
    .nota-tarifas{background:#f0f8f8;border-left:3px solid #1c9996;border-radius:4px;padding:10px 14px;font-size:12px;color:#555;margin-bottom:24px;line-height:1.6;}
    .sala-block{border:1px solid #e0e4ea;border-radius:10px;overflow:hidden;margin-bottom:16px;}
    .sala-header{background:#1f3444;padding:10px 18px;display:flex;align-items:center;gap:10px;}
    .sala-header .sala-nombre{font-size:15px;font-weight:700;color:#fff;}
    .sala-header .sala-badge-h{background:#1c9996;color:#fff;font-size:10px;font-weight:700;padding:2px 10px;border-radius:20px;text-transform:uppercase;}
    .turnos-table{width:100%;border-collapse:collapse;font-size:13px;}
    .turnos-table thead{background:#f5f7fa;}
    .turnos-table thead th{padding:8px 12px;text-align:left;font-size:11px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.8px;border-bottom:1px solid #e0e4ea;}
    .turnos-table tbody tr{border-bottom:1px solid #f0f2f5;}
    .turnos-table tbody tr:last-child{border-bottom:none;}
    .turnos-table tbody td{padding:9px 12px;color:#2c2c2c;vertical-align:middle;}
    .turno-pill{display:inline-block;font-size:11px;font-weight:700;padding:2px 10px;border-radius:20px;}
    .t-am{background:#e6f4ff;color:#0066cc;}
    .t-pm{background:#fff0e0;color:#b85c00;}
    .t-full{background:#e8f8f5;color:#0a7a6e;}
    .dia-l{color:#555;}
    .dia-d{color:#9b3a00;font-weight:600;}
    .tarifa-v{font-weight:700;color:#1c9996;font-size:14px;}
    .req-t{font-size:11px;color:#777;}
    .full-row{background:#f0faf9;}
    .cta-box{background:#1f3444;border-radius:10px;padding:24px;text-align:center;margin-bottom:20px;}
    .cta-box h2{margin:0 0 6px;font-size:17px;color:#fff;font-weight:700;}
    .cta-box p{margin:0 0 18px;font-size:13px;color:rgba(255,255,255,0.75);line-height:1.6;}
    .rut-instruccion{background:rgba(255,255,255,0.08);border:1px solid rgba(28,153,150,0.5);border-radius:8px;padding:10px 14px;font-size:12px;color:rgba(255,255,255,0.75);margin-bottom:18px;text-align:left;}
    .rut-instruccion strong{color:#1c9996;}
    .rut-ejemplo{font-family:monospace;font-size:15px;color:#fff;background:rgba(28,153,150,0.25);padding:2px 10px;border-radius:4px;}
    .btn-agendar{display:inline-block;background:#1c9996;color:#fff!important;text-decoration:none;font-size:16px;font-weight:700;padding:14px 36px;border-radius:8px;}
    .closing{font-size:13px;color:#666;line-height:1.7;margin:0;}
    .footer{background:#1f3444;padding:16px 36px;text-align:center;}
    .footer p{margin:0;font-size:11px;color:rgba(255,255,255,0.45);}
  </style>
</head>
<body>
<div class="wrapper">
  <div class="header"><img src="${LOGO}" alt="Karri"/></div>
  <div class="banner"><h1>🚨 BONO CYBER 2026 — DRIVER TOTTUS CALAMA 🚨</h1><p>Elige tu turno: AM · PM · Full · Bono $80.000 turno Full</p></div>
  <div class="body">
    <p class="intro">¡Hola <strong>{{nombre}}</strong>! El <strong>Cyber 2026</strong> arranca el <strong>1 de junio</strong> y abrimos operación para drivers en <strong>Tottus Calama</strong>. Elige AM, PM o Full, y si completas turno Full te llevas <strong>$80.000</strong> adicionales.</p>
    <div class="bono-box">
      <p class="bono-label">Bono exclusivo semana Cyber 2026</p>
      <div class="bono-amount">+ $80.000</div>
      <p class="bono-sub">Adicional a tu producción por operar durante la semana Cyber.<br><strong style="color:#fff;">⚠ Solo aplica para turno FULL con cumplimiento completo.</strong></p>
      <span class="bono-tag">✅ Requiere agendamiento</span>
      <span class="bono-tag">✅ Solo turno Full</span>
      <span class="bono-tag">✅ Cumplimiento 100%</span>
    </div>
    <div class="info-box">🆕 <strong>¡Novedad Cyber!</strong> Puedes elegir el turno que más te acomode: <strong>AM, PM o Full</strong>. Si completas turno Full, te llevas un bono adicional de <strong>$80.000</strong>.</div>
    <p class="section-label">Tarifas garantizadas · Tottus Calama</p>
    <div class="sala-block">
      <div class="sala-header"><span class="sala-nombre">Tottus Calama</span><span class="sala-badge-h">Tarifa especial</span></div>
      <table class="turnos-table">
        <thead><tr><th>Turno</th><th>Horario</th><th>Día</th><th>Asegurado</th><th>Requisito</th></tr></thead>
        <tbody>
          <tr><td><span class="turno-pill t-am">AM</span></td><td>08:00 – 15:00</td><td class="dia-l">Lun – Sáb</td><td class="tarifa-v">$18.000</td><td class="req-t">3 vueltas</td></tr>
          <tr><td><span class="turno-pill t-pm">PM</span></td><td>14:00 – 21:00</td><td class="dia-l">Lun – Sáb</td><td class="tarifa-v">$21.000</td><td class="req-t">4 vueltas</td></tr>
          <tr class="full-row"><td><span class="turno-pill t-full">FULL ⭐</span></td><td>08:00–20:00 / 09:00–21:00</td><td class="dia-l">Lun – Sáb</td><td class="tarifa-v">$40.000</td><td class="req-t">6 vueltas</td></tr>
          <tr><td><span class="turno-pill t-am">AM</span></td><td>08:00 – 15:00</td><td class="dia-d">Dom / Festivo</td><td class="tarifa-v">$21.000</td><td class="req-t">3 vueltas</td></tr>
          <tr><td><span class="turno-pill t-pm">PM</span></td><td>14:00 – 21:00</td><td class="dia-d">Dom / Festivo</td><td class="tarifa-v">$24.000</td><td class="req-t">4 vueltas</td></tr>
          <tr class="full-row"><td><span class="turno-pill t-full">FULL ⭐</span></td><td>08:00–20:00 / 09:00–21:00</td><td class="dia-d">Dom / Festivo</td><td class="tarifa-v">$45.000</td><td class="req-t">6 vueltas</td></tr>
        </tbody>
      </table>
    </div>
    <div class="nota-tarifas">💡 <strong>Tarifas brutas garantizadas</strong> por jornada. El bono de $80.000 aplica exclusivamente para turno <strong>Full con cumplimiento completo</strong> durante la semana Cyber.</div>
    <div class="cta-box">
      <h2>¡Agéndate y no pierdas el cupo!</h2>
      <p>Genera ingresos esta semana en Karri.<br>Solo necesitas tu RUT para reservar.</p>
      <div class="rut-instruccion">📋 Completa tu <strong>RUT con guion</strong> y sin puntos.<br>Ejemplo: <span class="rut-ejemplo">1234567-8</span></div>
      <a href="https://form.typeform.com/to/zrElrTjy" class="btn-agendar" target="_blank">📅 &nbsp;Agenda tu cupo ahora</a>
    </div>
    <p class="closing">Recuerda presentarte puntual y con tu implementación completa. Cualquier consulta contáctate con tu coordinador/a de operaciones.</p>
  </div>
  <div class="footer"><p>Driver Tottus Calama · Operaciones Karri · Cyber 2026</p></div>
</div>
</body>
</html>`;

// ─────────────────────────────────────────────────────────────────────────────
// 4. Bono Cyber 2026 — Picker Tottus (General)
// ─────────────────────────────────────────────────────────────────────────────
const htmlPickerTottus = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Cyber 2026 – Picker Tottus | Karri</title>
  <style>
    body{margin:0;padding:24px 16px;background:#f0f2f5;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;}
    .wrapper{max-width:640px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #d0d4da;}
    .header{background:#1f3444;padding:28px 36px;text-align:center;}
    .header img{height:52px;display:block;margin:0 auto;}
    .banner{background:#1c9996;padding:16px 36px;text-align:center;}
    .banner h1{margin:0;font-size:19px;font-weight:700;color:#fff;}
    .banner p{margin:6px 0 0;font-size:13px;color:rgba(255,255,255,0.85);}
    .body{padding:28px 36px;}
    .intro{font-size:15px;line-height:1.7;color:#2c2c2c;margin:0 0 22px;}
    .intro strong{color:#1c9996;}
    .bono-box{background:#1f3444;border-radius:10px;padding:22px 24px;text-align:center;margin-bottom:24px;}
    .bono-label{font-size:11px;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:1.2px;margin-bottom:6px;}
    .bono-amount{font-size:42px;font-weight:700;color:#1c9996;line-height:1;margin-bottom:6px;}
    .bono-sub{font-size:12px;color:rgba(255,255,255,0.65);margin-bottom:14px;line-height:1.6;}
    .bono-tag{display:inline-block;background:rgba(28,153,150,0.18);color:#1c9996;font-size:12px;padding:4px 14px;border-radius:20px;font-weight:600;margin:3px 4px;}
    .section-label{font-size:11px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:1.2px;margin:0 0 10px;}
    .sala-card{background:#fff;border:1px solid #e0e4ea;border-radius:8px;padding:14px 18px;display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;}
    .sala-nombre{font-size:15px;font-weight:700;color:#1f3444;margin-bottom:4px;}
    .sala-detalle{font-size:12px;color:#666;}
    .sala-detalle span{color:#1c9996;font-weight:700;}
    .sala-tarifa{font-size:20px;font-weight:700;color:#1f3444;white-space:nowrap;}
    .turnos-grid{display:flex;justify-content:space-between;width:100%;margin-bottom:24px;box-sizing:border-box;}
    .turno-card{width:48%;background:#f5f7fa;border:1px solid #e0e4ea;border-radius:8px;padding:14px;text-align:center;box-sizing:border-box;}
    .turno-label{font-size:20px;font-weight:700;color:#1c9996;margin-bottom:4px;}
    .turno-label.pm{color:#1f3444;}
    .turno-hora{font-size:12px;color:#666;}
    .turno-aviso{font-size:11px;color:#999;text-align:center;margin-top:8px;margin-bottom:24px;}
    .nota-tarifas{background:#f0f8f8;border-left:3px solid #1c9996;border-radius:4px;padding:10px 14px;font-size:12px;color:#555;margin-bottom:24px;line-height:1.6;}
    .cta-box{background:#1f3444;border-radius:10px;padding:24px;text-align:center;margin-bottom:20px;}
    .cta-box h2{margin:0 0 6px;font-size:17px;color:#fff;font-weight:700;}
    .cta-box p{margin:0 0 18px;font-size:13px;color:rgba(255,255,255,0.75);line-height:1.6;}
    .rut-instruccion{background:rgba(255,255,255,0.08);border:1px solid rgba(28,153,150,0.5);border-radius:8px;padding:10px 14px;font-size:12px;color:rgba(255,255,255,0.75);margin-bottom:18px;text-align:left;}
    .rut-instruccion strong{color:#1c9996;}
    .rut-ejemplo{font-family:monospace;font-size:15px;color:#fff;background:rgba(28,153,150,0.25);padding:2px 10px;border-radius:4px;}
    .btn-agendar{display:inline-block;background:#1c9996;color:#fff!important;text-decoration:none;font-size:16px;font-weight:700;padding:14px 36px;border-radius:8px;}
    .closing{font-size:13px;color:#666;line-height:1.7;margin:0;}
    .footer{background:#1f3444;padding:16px 36px;text-align:center;}
    .footer p{margin:0;font-size:11px;color:rgba(255,255,255,0.45);}
  </style>
</head>
<body>
<div class="wrapper">
  <div class="header"><img src="${LOGO}" alt="Karri"/></div>
  <div class="banner"><h1>🚨 BONO CYBER 2026 — PICKER TOTTUS 🚨</h1><p>Semana Cyber 2026 · Cupos AM y PM disponibles</p></div>
  <div class="body">
    <p class="intro">¡Hola <strong>{{nombre}}</strong>! El <strong>Cyber 2026</strong> arranca el <strong>1 de junio</strong> y necesitamos pickers comprometidos. Opera los días que puedas y acumula $7.000 por cada jornada que completes.</p>
    <div class="bono-box">
      <p class="bono-label">Bono por día asistido · del 1 al 5 de junio 2026</p>
      <div class="bono-amount">+ $7.000</div>
      <p class="bono-sub">¡Entre más días asistas, mayor es tu bono! Máximo $35.000 en 5 días.</p>
      <span class="bono-tag">✅ Asistencia completa</span>
      <span class="bono-tag">✅ Jornada completa</span>
    </div>
    <p class="section-label">Turnos disponibles</p>
    <div class="turnos-grid">
      <div class="turno-card"><div class="turno-label">AM</div><div class="turno-hora">08:00 – 18:00 hrs</div></div>
      <div class="turno-card"><div class="turno-label pm">PM</div><div class="turno-hora">11:00 – 21:00 hrs</div></div>
    </div>
    <p class="turno-aviso">⚠ Cupos AM y PM limitados — agenda rápido</p>
    <p class="section-label">Salas y proyección de ingresos (6 días)</p>
    <div class="sala-card">
      <div><div class="sala-nombre">Tottus Pajaritos</div><div class="sala-detalle">$34.400/día · 6 días = <span>$206.400</span> + bono hasta <span>$35.000</span></div></div>
      <div class="sala-tarifa">$34.400</div>
    </div>
    <div class="sala-card">
      <div><div class="sala-nombre">Tottus Buín</div><div class="sala-detalle">$34.400/día · 6 días = <span>$206.400</span> + bono hasta <span>$35.000</span></div></div>
      <div class="sala-tarifa">$34.400</div>
    </div>
    <div class="sala-card">
      <div><div class="sala-nombre">Tottus Puente Alto</div><div class="sala-detalle">$34.400/día · 6 días = <span>$206.400</span> + bono hasta <span>$35.000</span></div></div>
      <div class="sala-tarifa">$34.400</div>
    </div>
    <div class="nota-tarifas">💡 <strong>Tarifas brutas:</strong> los montos indicados corresponden al valor bruto por jornada. Los descuentos de ley se aplican según corresponda.</div>
    <div class="cta-box">
      <h2>¡Agéndate y no pierdas el cupo!</h2>
      <p>Genera ingresos esta semana en Karri.<br>Solo necesitas tu RUT para reservar.</p>
      <div class="rut-instruccion">📋 Completa tu <strong>RUT con guion</strong> y sin puntos.<br>Ejemplo: <span class="rut-ejemplo">1234567-8</span></div>
      <a href="https://form.typeform.com/to/zrElrTjy" class="btn-agendar" target="_blank">📅 &nbsp;Agenda tu cupo ahora</a>
    </div>
    <p class="closing">Recuerda presentarte puntual y con tu implementación completa. Cualquier consulta contáctate con tu coordinador/a de operaciones.</p>
  </div>
  <div class="footer"><p>Picker Tottus · Operaciones Karri · Cyber 2026</p></div>
</div>
</body>
</html>`;

// ─────────────────────────────────────────────────────────────────────────────
// 5. Bono Cyber 2026 — Driver Tottus Talca
// ─────────────────────────────────────────────────────────────────────────────
const htmlDriverTalca = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Cyber 2026 – Driver Tottus Talca | Karri</title>
  <style>
    body{margin:0;padding:24px 16px;background:#f0f2f5;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;}
    .wrapper{max-width:640px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #d0d4da;}
    .header{background:#1f3444;padding:28px 36px;text-align:center;}
    .header img{height:52px;display:block;margin:0 auto;}
    .banner{background:#1c9996;padding:16px 36px;text-align:center;}
    .banner h1{margin:0;font-size:19px;font-weight:700;color:#fff;}
    .banner p{margin:6px 0 0;font-size:13px;color:rgba(255,255,255,0.85);}
    .body{padding:28px 36px;}
    .intro{font-size:15px;line-height:1.7;color:#2c2c2c;margin:0 0 22px;}
    .intro strong{color:#1c9996;}
    .bono-box{background:#1f3444;border-radius:10px;padding:22px 24px;text-align:center;margin-bottom:24px;}
    .bono-label{font-size:11px;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:1.2px;margin-bottom:6px;}
    .bono-amount{font-size:42px;font-weight:700;color:#1c9996;line-height:1;margin-bottom:6px;}
    .bono-sub{font-size:12px;color:rgba(255,255,255,0.65);margin-bottom:14px;line-height:1.6;}
    .bono-tag{display:inline-block;background:rgba(28,153,150,0.18);color:#1c9996;font-size:12px;padding:4px 14px;border-radius:20px;font-weight:600;margin:3px 4px;}
    .section-label{font-size:11px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:1.2px;margin:0 0 10px;}
    .info-box{background:#eef8f8;border-left:3px solid #1c9996;border-radius:4px;padding:12px 16px;font-size:13px;color:#2c2c2c;margin-bottom:24px;line-height:1.6;}
    .info-box strong{color:#1f3444;}
    .nota-tarifas{background:#f0f8f8;border-left:3px solid #1c9996;border-radius:4px;padding:10px 14px;font-size:12px;color:#555;margin-bottom:24px;line-height:1.6;}
    .sala-block{border:1px solid #e0e4ea;border-radius:10px;overflow:hidden;margin-bottom:16px;}
    .sala-header{background:#1f3444;padding:10px 18px;display:flex;align-items:center;gap:10px;}
    .sala-header .sala-nombre{font-size:15px;font-weight:700;color:#fff;}
    .sala-header .sala-badge-h{background:#1c9996;color:#fff;font-size:10px;font-weight:700;padding:2px 10px;border-radius:20px;text-transform:uppercase;}
    .turnos-table{width:100%;border-collapse:collapse;font-size:13px;}
    .turnos-table thead{background:#f5f7fa;}
    .turnos-table thead th{padding:8px 12px;text-align:left;font-size:11px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.8px;border-bottom:1px solid #e0e4ea;}
    .turnos-table tbody tr{border-bottom:1px solid #f0f2f5;}
    .turnos-table tbody tr:last-child{border-bottom:none;}
    .turnos-table tbody td{padding:9px 12px;color:#2c2c2c;vertical-align:middle;}
    .turno-pill{display:inline-block;font-size:11px;font-weight:700;padding:2px 10px;border-radius:20px;}
    .t-am{background:#e6f4ff;color:#0066cc;}
    .t-pm{background:#fff0e0;color:#b85c00;}
    .t-full{background:#e8f8f5;color:#0a7a6e;}
    .dia-l{color:#555;}
    .dia-d{color:#9b3a00;font-weight:600;}
    .tarifa-v{font-weight:700;color:#1c9996;font-size:14px;}
    .req-t{font-size:11px;color:#777;}
    .full-row{background:#f0faf9;}
    .cta-box{background:#1f3444;border-radius:10px;padding:24px;text-align:center;margin-bottom:20px;}
    .cta-box h2{margin:0 0 6px;font-size:17px;color:#fff;font-weight:700;}
    .cta-box p{margin:0 0 18px;font-size:13px;color:rgba(255,255,255,0.75);line-height:1.6;}
    .rut-instruccion{background:rgba(255,255,255,0.08);border:1px solid rgba(28,153,150,0.5);border-radius:8px;padding:10px 14px;font-size:12px;color:rgba(255,255,255,0.75);margin-bottom:18px;text-align:left;}
    .rut-instruccion strong{color:#1c9996;}
    .rut-ejemplo{font-family:monospace;font-size:15px;color:#fff;background:rgba(28,153,150,0.25);padding:2px 10px;border-radius:4px;}
    .btn-agendar{display:inline-block;background:#1c9996;color:#fff!important;text-decoration:none;font-size:16px;font-weight:700;padding:14px 36px;border-radius:8px;}
    .closing{font-size:13px;color:#666;line-height:1.7;margin:0;}
    .footer{background:#1f3444;padding:16px 36px;text-align:center;}
    .footer p{margin:0;font-size:11px;color:rgba(255,255,255,0.45);}
  </style>
</head>
<body>
<div class="wrapper">
  <div class="header"><img src="${LOGO}" alt="Karri"/></div>
  <div class="banner"><h1>🚨 BONO CYBER 2026 — DRIVER TOTTUS TALCA 🚨</h1><p>Elige tu turno: AM · PM · Full · Bono $80.000 turno Full</p></div>
  <div class="body">
    <p class="intro">¡Hola <strong>{{nombre}}</strong>! El <strong>Cyber 2026</strong> arranca el <strong>1 de junio</strong> y abrimos operación para drivers en <strong>Tottus Talca</strong>. Elige AM, PM o Full, y si completas turno Full te llevas <strong>$80.000</strong> adicionales.</p>
    <div class="bono-box">
      <p class="bono-label">Bono exclusivo semana Cyber 2026</p>
      <div class="bono-amount">+ $80.000</div>
      <p class="bono-sub">Adicional a tu producción por operar durante la semana Cyber.<br><strong style="color:#fff;">⚠ Solo aplica para turno FULL con cumplimiento completo.</strong></p>
      <span class="bono-tag">✅ Requiere agendamiento</span>
      <span class="bono-tag">✅ Solo turno Full</span>
      <span class="bono-tag">✅ Cumplimiento 100%</span>
    </div>
    <div class="info-box">🆕 <strong>¡Novedad Cyber!</strong> Puedes elegir el turno que más te acomode: <strong>AM, PM o Full</strong>. Si completas turno Full, te llevas un bono adicional de <strong>$80.000</strong>.</div>
    <p class="section-label">Tarifas garantizadas · Tottus Talca</p>
    <div class="sala-block">
      <div class="sala-header"><span class="sala-nombre">Tottus Talca</span><span class="sala-badge-h">Tarifa especial</span></div>
      <table class="turnos-table">
        <thead><tr><th>Turno</th><th>Horario</th><th>Día</th><th>Asegurado</th><th>Requisito</th></tr></thead>
        <tbody>
          <tr><td><span class="turno-pill t-am">AM</span></td><td>08:00 – 15:00</td><td class="dia-l">Lun – Sáb</td><td class="tarifa-v">$18.000</td><td class="req-t">3 vueltas</td></tr>
          <tr><td><span class="turno-pill t-pm">PM</span></td><td>14:00 – 21:00</td><td class="dia-l">Lun – Sáb</td><td class="tarifa-v">$21.000</td><td class="req-t">4 vueltas</td></tr>
          <tr class="full-row"><td><span class="turno-pill t-full">FULL ⭐</span></td><td>08:00–20:00 / 09:00–21:00</td><td class="dia-l">Lun – Sáb</td><td class="tarifa-v">$38.000</td><td class="req-t">6 vueltas</td></tr>
          <tr><td><span class="turno-pill t-am">AM</span></td><td>08:00 – 15:00</td><td class="dia-d">Dom / Festivo</td><td class="tarifa-v">$20.000</td><td class="req-t">3 vueltas</td></tr>
          <tr><td><span class="turno-pill t-pm">PM</span></td><td>14:00 – 21:00</td><td class="dia-d">Dom / Festivo</td><td class="tarifa-v">$22.000</td><td class="req-t">4 vueltas</td></tr>
          <tr class="full-row"><td><span class="turno-pill t-full">FULL ⭐</span></td><td>08:00–20:00 / 09:00–21:00</td><td class="dia-d">Dom / Festivo</td><td class="tarifa-v">$42.000</td><td class="req-t">6 vueltas</td></tr>
        </tbody>
      </table>
    </div>
    <div class="nota-tarifas">💡 <strong>Tarifas brutas garantizadas</strong> por jornada. El bono de $80.000 aplica exclusivamente para turno <strong>Full con cumplimiento completo</strong> durante la semana Cyber.</div>
    <div class="cta-box">
      <h2>¡Agéndate y no pierdas el cupo!</h2>
      <p>Genera ingresos esta semana en Karri.<br>Solo necesitas tu RUT para reservar.</p>
      <div class="rut-instruccion">📋 Completa tu <strong>RUT con guion</strong> y sin puntos.<br>Ejemplo: <span class="rut-ejemplo">1234567-8</span></div>
      <a href="https://form.typeform.com/to/zrElrTjy" class="btn-agendar" target="_blank">📅 &nbsp;Agenda tu cupo ahora</a>
    </div>
    <p class="closing">Recuerda presentarte puntual y con tu implementación completa. Cualquier consulta contáctate con tu coordinador/a de operaciones.</p>
  </div>
  <div class="footer"><p>Driver Tottus Talca · Operaciones Karri · Cyber 2026</p></div>
</div>
</body>
</html>`;

// ─────────────────────────────────────────────────────────────────────────────
// Escribir templates.json (preserva los existentes)
// ─────────────────────────────────────────────────────────────────────────────
let existing = [];
if (fs.existsSync(TPL_FILE)) {
  try { existing = JSON.parse(fs.readFileSync(TPL_FILE, 'utf8')); } catch {}
}

const nuevas = [
  t(uuidv4(), 'Agendamiento Semanal — Falabella',         htmlAgendamiento),
  t(uuidv4(), 'Bono Cyber 2026 — Picker Tottus Piedra Roja', htmlPickerPiedraRoja),
  t(uuidv4(), 'Bono Cyber 2026 — Driver Tottus Calama',   htmlDriverCalama),
  t(uuidv4(), 'Bono Cyber 2026 — Picker Tottus General',  htmlPickerTottus),
  t(uuidv4(), 'Bono Cyber 2026 — Driver Tottus Talca',    htmlDriverTalca),
];

// Agrega al inicio, sin duplicar por nombre
const nombres = new Set(existing.map(e => e.name));
const porAgregar = nuevas.filter(n => !nombres.has(n.name));
const final = [...porAgregar, ...existing];

fs.writeFileSync(TPL_FILE, JSON.stringify(final, null, 2));
console.log(`✓ ${porAgregar.length} plantillas agregadas. Total: ${final.length}`);
porAgregar.forEach(p => console.log(`  - ${p.name}`));
