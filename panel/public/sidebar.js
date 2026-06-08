/* sidebar.js — inyecta la sidebar con secciones según rol y permisos */
(function () {
  const SECTIONS = [
    {
      label: 'Finanzas',
      perm:  'finanzas',
      items: [
        { label: 'Devoluciones',   href: '/',                    icon: 'undo-2', key: 'devoluciones'   },
        { label: 'Conciliaciones', href: '/conciliaciones.html', icon: 'truck',  key: 'conciliaciones' },
      ],
    },
    {
      label: 'Onboarding',
      perm:  'onboarding',
      items: [
        { label: 'Resumen',      href: '/onboarding/resumen.html',   icon: 'layout-dashboard', key: 'ob-resumen'  },
        { label: 'Email masivo', href: '/onboarding/email.html',     icon: 'mail',             key: 'ob-email'    },
        { label: 'WhatsApp',     href: '/onboarding/whatsapp.html',  icon: 'message-circle',   key: 'ob-whatsapp' },
      ],
    },
    {
      label: 'Perfiles',
      perm:  'perfiles',
      items: [
        { label: 'Usuarios', href: '/perfiles.html', icon: 'users', key: 'perfiles' },
      ],
    },
  ];

  const ROLE_BADGE = {
    admin:    { label: 'Admin',    color: '#78fcd6', bg: 'rgba(120,252,214,0.1)', border: 'rgba(120,252,214,0.25)' },
    advanced: { label: 'Advanced', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.25)'  },
    beginner: { label: 'Beginner', color: 'rgba(231,236,235,0.6)', bg: 'rgba(255,255,255,0.07)', border: 'rgba(255,255,255,0.1)' },
  };

  async function applyLogoCanvas(canvas) {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = '/api/logo-proxy'; });

    const tmp = document.createElement('canvas');
    tmp.width  = img.naturalWidth;
    tmp.height = img.naturalHeight;
    const tCtx = tmp.getContext('2d');
    tCtx.drawImage(img, 0, 0);
    const id = tCtx.getImageData(0, 0, tmp.width, tmp.height);
    const d = id.data;

    // Eliminar fondo blanco y píxeles anti-alias (brillo alto + saturación baja)
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i+1], b = d[i+2];
      const brightness  = (r + g + b) / 3;
      const saturation  = Math.max(r, g, b) - Math.min(r, g, b);
      if (brightness > 200 && saturation < 60) {
        d[i+3] = 0;
      } else if (brightness > 160 && saturation < 40) {
        d[i+3] = Math.round(d[i+3] * ((brightness - 160) < 40 ? 1 - (brightness - 160) / 40 : 0));
      }
    }
    tCtx.putImageData(id, 0, 0);

    // Bounding box usando umbral de alpha > 30 para ignorar residuos
    let minX = tmp.width, minY = tmp.height, maxX = 0, maxY = 0;
    for (let y = 0; y < tmp.height; y++) {
      for (let x = 0; x < tmp.width; x++) {
        if (d[(y * tmp.width + x) * 4 + 3] > 30) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    const w = maxX - minX + 1;
    const h = maxY - minY + 1;
    canvas.width  = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(tmp, minX, minY, w, h, 0, 0, w, h);
  }

  async function init(activeKey) {
    let me = { role: 'beginner', username: '', name: '', sections: [] };
    try { me = await fetch('/api/me').then(r => r.json()); } catch {}

    // admin sees all; advanced/beginner see only their assigned sections
    const perms = me.sections || [];

    const el = document.getElementById('sidebar');
    if (!el) return;

    // Estado de colapso persistido en localStorage
    const collapseKey = 'sidebar_collapsed';
    let collapsed = {};
    try { collapsed = JSON.parse(localStorage.getItem(collapseKey) || '{}'); } catch {}

    function toggleSection(perm) {
      collapsed[perm] = !collapsed[perm];
      localStorage.setItem(collapseKey, JSON.stringify(collapsed));
      const items   = document.getElementById(`sec-items-${perm}`);
      const chevron = document.getElementById(`sec-chevron-${perm}`);
      const header  = document.getElementById(`sec-header-${perm}`);
      const open = !collapsed[perm];
      if (items) {
        items.style.maxHeight = open ? '500px' : '0';
        items.style.opacity   = open ? '1' : '0';
        items.style.padding   = open ? '4px 6px' : '0';
      }
      if (chevron) chevron.style.transform = open ? 'rotate(0deg)' : 'rotate(-90deg)';
    }
    window._sidebarToggle = toggleSection;

    const navHTML = SECTIONS
      .filter(s => perms.includes(s.perm))
      .map(s => {
        const isCollapsed = !!collapsed[s.perm];
        return `
        <div style="margin-bottom:1px;overflow:hidden;">
          <button onclick="window._sidebarToggle('${s.perm}')" style="
            display:flex;align-items:center;justify-content:space-between;
            width:100%;padding:7px 16px 5px;background:none;border:none;
            border-bottom:none;
            cursor:pointer;transition:border-color .2s;
          " id="sec-header-${s.perm}">
            <span style="font-size:13px;color:rgba(231,236,235,0.5);font-weight:500;">${s.label}</span>
            <i id="sec-chevron-${s.perm}" data-lucide="chevron-down" style="width:12px;height:12px;color:rgba(231,236,235,0.25);transition:transform .2s;${isCollapsed ? 'transform:rotate(-90deg);' : ''}"></i>
          </button>
          <div id="sec-items-${s.perm}" style="
            overflow:hidden;transition:max-height .22s ease,opacity .18s ease;
            max-height:${isCollapsed ? '0' : '500px'};
            opacity:${isCollapsed ? '0' : '1'};
            padding:${isCollapsed ? '0' : '4px 6px'};
          ">
            ${s.items.map(item => `
              <a href="${item.href}" class="nav-item ${item.key === activeKey ? 'active' : ''}" style="margin-bottom:2px;"${item.external ? ' target="_blank" rel="noopener"' : ''}>
                <i data-lucide="${item.icon}" style="width:15px;height:15px;flex-shrink:0;"></i>
                ${item.label}
                ${item.external ? `<i data-lucide="external-link" style="width:11px;height:11px;margin-left:auto;opacity:.35;"></i>` : ''}
              </a>`).join('')}
          </div>
        </div>`;
      }).join('');

    const badge = ROLE_BADGE[me.role] || ROLE_BADGE.beginner;

    el.innerHTML = `
      <div style="padding:18px 16px 16px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:10px;">
        <canvas id="sidebar-logo" style="height:36px;width:auto;display:block;flex-shrink:0;"></canvas>
        <div style="
          display:flex;align-items:center;justify-content:center;
          padding:5px 10px;
          border-radius:8px;
          background:linear-gradient(145deg,#1e2423,#141817);
          border:1px solid rgba(255,255,255,0.09);
          box-shadow:
            0 2px 8px rgba(0,0,0,0.55),
            0 1px 0 rgba(255,255,255,0.06) inset,
            0 -1px 0 rgba(0,0,0,0.4) inset;
        ">
          <img src="https://res.cloudinary.com/dkkab5dea/image/upload/v1778254790/guphgo6mzpq46e71nk0f.png"
               alt="Karri" style="height:18px;width:auto;display:block;object-fit:contain;">
        </div>
      </div>
      <nav class="flex-1 px-3 py-4 overflow-y-auto">${navHTML}</nav>
      <div class="px-3 pb-5" style="border-top:1px solid rgba(255,255,255,0.06);">
        <div class="pt-4">
          <div style="padding:6px 14px 12px;font-size:11px;color:rgba(231,236,235,0.35);">
            <span style="color:rgba(120,252,214,0.7);font-weight:600;">${me.name || me.username}</span>
            <span style="display:inline-block;margin-left:6px;font-size:9px;background:${badge.bg};color:${badge.color};padding:1px 7px;border-radius:99px;border:1px solid ${badge.border};font-weight:700;text-transform:uppercase;">${badge.label}</span>
          </div>
          <form method="POST" action="/logout">
            <button type="submit" class="nav-item w-full text-left" style="color:rgba(231,236,235,0.4);">
              <i data-lucide="log-out" style="width:15px;height:15px;flex-shrink:0;"></i>
              Cerrar sesión
            </button>
          </form>
        </div>
      </div>`;

    if (window.lucide) lucide.createIcons({ el });

    const logoCanvas = el.querySelector('#sidebar-logo');
    if (logoCanvas) applyLogoCanvas(logoCanvas).catch(() => {});
  }

  window.initSidebar = init;
})();
