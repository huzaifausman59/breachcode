    initLayout();

    async function loadDashboard() {
      try {
        const { campaigns } = await API.get('/campaigns');

        // Aggregate stats across all campaigns.
        let totals = { sent: 0, opened: 0, clicked: 0, submitted: 0, reported: 0 };

        const summaries = await Promise.all(
          campaigns.slice(0, 10).map(c =>
            API.get(`/analytics/campaign/${c.id}`).catch(() => ({ summary: {} }))
          )
        );

        summaries.forEach(({ summary }) => {
          if (!summary) return;
          totals.sent      += summary.total_sent || 0;
          totals.opened    += summary.opened     || 0;
          totals.clicked   += summary.clicked    || 0;
          totals.submitted += summary.submitted  || 0;
          totals.reported  += summary.reported   || 0;
        });

        // Render stat rings.
        const grid = document.getElementById('stat-grid');
        grid.innerHTML = '';
        const stats = [
          { label: 'Sent',      value: totals.sent,      color: 'var(--ring-sent)' },
          { label: 'Opened',    value: totals.opened,    color: 'var(--ring-opened)' },
          { label: 'Clicked',   value: totals.clicked,   color: 'var(--ring-clicked)' },
          { label: 'Submitted', value: totals.submitted, color: 'var(--ring-submitted)' },
          { label: 'Reported',  value: totals.reported,  color: 'var(--ring-reported)' },
        ];
        stats.forEach(({ label, value, color }) => {
          grid.appendChild(UI.statCard(label, value, Math.max(totals.sent, 1), color));
        });

        // Render campaign table.
        const tbody = document.getElementById('campaign-tbody');
        if (campaigns.length === 0) {
          tbody.innerHTML = `<tr><td colspan="7">
            <div class="empty-state">
              <h3>No campaigns yet</h3>
              <p>Create your first phishing simulation campaign to get started.</p>
              <a href="/campaigns.html" class="btn btn-primary" style="margin-top:16px">Create Campaign</a>
            </div>
          </td></tr>`;
          return;
        }

        tbody.innerHTML = campaigns.slice(0, 8).map((c, i) => {
          const s = summaries[i]?.summary || {};
          return `<tr>
            <td><a href="/campaigns.html#${esc(c.id)}">${esc(c.name)}</a></td>
            <td><span class="badge badge-info">${esc(c.phase.toUpperCase())}</span></td>
            <td>${UI.statusBadge(c.status)}</td>
            <td>${s.total_sent  || 0}</td>
            <td>${s.clicked     || 0}</td>
            <td>${s.submitted   || 0}</td>
            <td class="table-actions">
              <a href="/campaigns.html#${esc(c.id)}" class="btn btn-secondary btn-sm">View</a>
            </td>
          </tr>`;
        }).join('');

      } catch (err) {
        UI.toast('Failed to load dashboard: ' + err.message, 'error');
      }
    }

    loadDashboard();

    // Mobile menu toggle.
    document.getElementById('mobile-menu-btn').addEventListener('click', () => {
      const sidebar = document.getElementById('sidebar');
      const open = sidebar.classList.toggle('open');
      document.getElementById('mobile-menu-btn').setAttribute('aria-expanded', open);
    });
  
