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
        { label: 'Altas OB',     href: 'https://docs.google.com/spreadsheets/d/1pHVpNMirkUmjp4jHsAPsSOFRRMRbE2e9cY6xVSDM8jo/edit?gid=0#gid=0', icon: 'table-2', key: 'ob-altas', external: true },
        { label: 'KPI',          href: 'https://datastudio.google.com/reporting/8247fa84-63cd-4f18-90ab-9ec32dbd1ae2/page/p_h06xxldt3d', icon: 'bar-chart-2', key: 'ob-kpi', external: true },
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

  async function init(activeKey) {
    let me = { role: 'beginner', username: '', name: '', sections: [] };
    try { me = await fetch('/api/me').then(r => r.json()); } catch {}

    // admin sees all; advanced/beginner see only their assigned sections
    const perms = me.sections || [];

    const el = document.getElementById('sidebar');
    if (!el) return;

    const navHTML = SECTIONS
      .filter(s => perms.includes(s.perm))
      .map(s => `
        <div class="mb-3">
          <p style="font-size:9px;color:rgba(231,236,235,0.3);font-weight:700;text-transform:uppercase;letter-spacing:.12em;padding:0 14px 6px;">${s.label}</p>
          ${s.items.map(item => `
            <a href="${item.href}" class="nav-item ${item.key === activeKey ? 'active' : ''}" style="margin-bottom:2px;"${item.external ? ' target="_blank" rel="noopener"' : ''}>
              <i data-lucide="${item.icon}" style="width:15px;height:15px;flex-shrink:0;"></i>
              ${item.label}
              ${item.external ? `<i data-lucide="external-link" style="width:11px;height:11px;margin-left:auto;opacity:.35;"></i>` : ''}
            </a>`).join('')}
        </div>`).join('');

    const badge = ROLE_BADGE[me.role] || ROLE_BADGE.beginner;

    el.innerHTML = `
      <div class="px-5 pt-6 pb-5" style="border-bottom:1px solid rgba(255,255,255,0.06);">
        <img src="https://res.cloudinary.com/dkkab5dea/image/upload/v1778254790/guphgo6mzpq46e71nk0f.png"
             alt="Karri" style="height:28px;width:auto;object-fit:contain;">
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
  }

  window.initSidebar = init;
})();
