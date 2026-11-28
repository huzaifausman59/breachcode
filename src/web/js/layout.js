/**
 * Injects the sidebar navigation into the page.
 * Also handles: active link highlighting, user display, logout.
 * Called by every authenticated page.
 */

async function initLayout() {
  // Fetch current user.
  let user = null;
  try {
    const data = await API.get('/auth/me');
    user = data.user;
  } catch {
    window.location.href = '/login.html';
    return;
  }

  // Build sidebar HTML.
  const isAdmin = user.role === 'admin';
  const initials = user.username.slice(0, 2).toUpperCase();

  const nav = [
    { href: '/dashboard.html',    label: 'Dashboard',    icon: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z' },
    { href: '/campaigns.html',    label: 'Campaigns',    icon: 'M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z' },
    { href: '/templates.html',    label: 'Templates',    icon: 'M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z' },
    { href: '/participants.html', label: 'Participants', icon: 'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z' },
    { href: '/lessons.html',      label: 'Lessons',      icon: 'M12 3L1 9l11 6 9-4.91V17h2V9L12 3zM5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82z' },
    { href: '/analytics.html',    label: 'Analytics',    icon: 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z' },
    ...(isAdmin ? [
      { href: '/admin.html', label: 'Admin', icon: 'M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z', badge: 'Admin' },
    ] : []),
  ];

  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  sidebar.innerHTML = `
    <a href="/dashboard.html" class="sidebar-brand" aria-label="BreachCoach home">
      <div class="sidebar-brand-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg>
      </div>
      <span class="sidebar-brand-name">BreachCoach</span>
    </a>

    <nav aria-label="Main navigation">
      <ul class="sidebar-nav" role="list">
        ${nav.map(({ href, label, icon, badge }) => `
          <li>
            <a href="${href}" ${window.location.pathname === href ? 'class="active" aria-current="page"' : ''}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="${icon}"/></svg>
              ${label}
              ${badge ? `<span class="nav-badge">${badge}</span>` : ''}
            </a>
          </li>
        `).join('')}
      </ul>
    </nav>

    <div class="sidebar-footer">
      <div class="sidebar-user">
        <div class="sidebar-avatar" aria-hidden="true">${esc(initials)}</div>
        <div>
          <div class="sidebar-username">${esc(user.username)}</div>
          <div class="sidebar-role">${esc(user.role)}</div>
        </div>
      </div>
      <button id="logout-btn" class="btn btn-secondary btn-sm w-full" style="justify-content:center;margin-top:8px">
        Sign out
      </button>
    </div>`;

  document.getElementById('logout-btn').addEventListener('click', async () => {
    try {
      await API.post('/auth/logout');
    } catch { /* ignore */ }
    window.location.href = '/login.html';
  });
}

window.initLayout = initLayout;
