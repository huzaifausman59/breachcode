    initLayout();
    let campaigns = [];

    document.getElementById('c-phase').addEventListener('change', (e) => {
      document.getElementById('pre-campaign-group').classList.toggle('hidden', e.target.value !== 'post');
    });

    async function loadCampaigns() {
      const { campaigns: cs } = await API.get('/campaigns');
      campaigns = cs;

      // Populate pre-campaign dropdown.
      const pre = document.getElementById('c-pre-campaign');
      pre.innerHTML = '<option value="">— Select pre-training campaign —</option>' +
        cs.filter(c => c.phase === 'pre').map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');

      const tbody = document.getElementById('campaign-tbody');
      if (!cs.length) {
        tbody.innerHTML = `<tr><td colspan="7">
          <div class="empty-state">
            <h3>No campaigns yet</h3>
            <p>Create your first campaign to send simulated phishing emails.</p>
          </div>
        </td></tr>`;
        return;
      }

      const summaries = await Promise.all(cs.map(c =>
        API.get(`/analytics/campaign/${c.id}`).catch(() => ({ summary: {} }))
      ));

      tbody.innerHTML = cs.map((c, i) => {
        const s = summaries[i]?.summary || {};
        return `<tr>
          <td><a href="#${esc(c.id)}" data-action="showDetail" data-args="${esc(JSON.stringify([c.id]))}">${esc(c.name)}</a></td>
          <td><span class="badge badge-info">${esc(c.phase.toUpperCase())}</span></td>
          <td>${UI.statusBadge(c.status)}</td>
          <td>${s.total_sent  || 0}</td>
          <td>${s.clicked     || 0}</td>
          <td>${s.submitted   || 0}</td>
          <td class="table-actions">
            <button class="btn btn-secondary btn-sm" data-action="showDetail" data-args="${esc(JSON.stringify([c.id]))}">View</button>
            ${c.status === 'draft' ? `<button class="btn btn-primary btn-sm" data-action="sendCampaign" data-args="${esc(JSON.stringify([c.id, c.name]))}">Send</button>` : ''}
            ${['draft','active','sending'].includes(c.status) ? `<button class="btn btn-danger btn-sm" data-action="cancelCampaign" data-args="${esc(JSON.stringify([c.id, c.name]))}">Cancel</button>` : ''}
          </td>
        </tr>`;
      }).join('');
    }

    async function showDetail(id) {
      document.getElementById('campaign-list-card').classList.add('hidden');
      document.getElementById('campaign-detail').classList.remove('hidden');

      const { campaign, recipients, summary } = await API.get(`/campaigns/${id}`);
      const events = await API.get(`/analytics/campaign/${id}`);

      document.getElementById('detail-header').innerHTML = `
        <div class="card-body">
          <div class="flex items-center justify-between">
            <div>
              <h2 style="font-size:20px;font-weight:800">${esc(campaign.name)}</h2>
              <p class="text-sm text-muted">Phase: ${esc(campaign.phase)} · ${UI.statusBadge(campaign.status)}</p>
            </div>
            ${campaign.status === 'draft'
              ? `<button class="btn btn-primary" data-action="sendCampaign" data-args="${esc(JSON.stringify([campaign.id, campaign.name]))}">Send Campaign</button>`
              : `<a href="/api/v1/reports/campaign/${esc(campaign.id)}?format=html" target="_blank" class="btn btn-secondary">Export Report</a>`}
          </div>
        </div>`;

      const stats = document.getElementById('detail-stats');
      stats.innerHTML = '';
      const s = summary;
      [
        { label: 'Sent',      val: s.total_sent,  color: 'var(--ring-sent)' },
        { label: 'Opened',    val: s.opened,      color: 'var(--ring-opened)' },
        { label: 'Clicked',   val: s.clicked,     color: 'var(--ring-clicked)' },
        { label: 'Submitted', val: s.submitted,   color: 'var(--ring-submitted)' },
        { label: 'Reported',  val: s.reported,    color: 'var(--ring-reported)' },
      ].forEach(({ label, val, color }) => {
        stats.appendChild(UI.statCard(label, val || 0, Math.max(s.total_sent || 1, 1), color));
      });

      // Timeline from recipients.
      const timeline = document.getElementById('detail-timeline');
      if (!recipients.length) {
        timeline.innerHTML = '<p class="text-muted">No recipients yet — send the campaign first.</p>';
      } else {
        timeline.innerHTML = recipients.slice(0, 20).map(r => `
          <div class="timeline-item">
            <div class="timeline-dot timeline-dot-sent">
              <svg viewBox="0 0 24 24"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z"/></svg>
            </div>
            <div class="timeline-label">${esc(r.email)}</div>
            <div class="timeline-time">Status: ${esc(r.status)} · Sent: ${r.sent_at ? new Date(r.sent_at).toLocaleString() : 'pending'}</div>
          </div>`).join('');
      }
    }

    document.getElementById('back-btn').addEventListener('click', () => {
      document.getElementById('campaign-list-card').classList.remove('hidden');
      document.getElementById('campaign-detail').classList.add('hidden');
    });

    async function sendCampaign(id, name) {
      UI.confirm(
        `Send campaign "${name}" to all consented participants? This will deliver simulated phishing emails to MailHog.`,
        async () => {
          try {
            const result = await API.post(`/campaigns/${id}/send`, { confirm: true });
            UI.toast(`Campaign sent to ${esc(result.sent)} participant(s).`, 'success');
            loadCampaigns();
          } catch (err) {
            UI.toast('Send failed: ' + err.message, 'error');
          }
        },
        'Send Campaign',
      );
    }

    async function cancelCampaign(id, name) {
      UI.confirm(`Cancel campaign "${name}"?`, async () => {
        try {
          await API.post(`/campaigns/${id}/cancel`, {});
          UI.toast('Campaign cancelled.', 'success');
          loadCampaigns();
        } catch (err) { UI.toast(err.message, 'error'); }
      }, 'Cancel Campaign');
    }

    document.getElementById('new-campaign-btn').addEventListener('click', async () => {
      document.getElementById('campaign-form').reset();
      document.getElementById('pre-campaign-group').classList.add('hidden');
      const sel = document.getElementById('c-template');
      sel.innerHTML = '<option value="">Loading…</option>';
      UI.openModal('campaign-modal');
      const { templates } = await API.get('/templates');
      sel.innerHTML = '<option value="">— Select template —</option>' +
        templates.map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('');
    });

    document.getElementById('campaign-save-btn').addEventListener('click', async () => {
      const btn = document.getElementById('campaign-save-btn');
      btn.disabled = true; btn.textContent = 'Creating…';
      try {
        const body = {
          name:            document.getElementById('c-name').value.trim(),
          template_id:     document.getElementById('c-template').value,
          phase:           document.getElementById('c-phase').value,
          pre_campaign_id: document.getElementById('c-pre-campaign').value || undefined,
        };
        await API.post('/campaigns', body);
        UI.closeModal('campaign-modal');
        UI.toast('Campaign created.', 'success');
        loadCampaigns();
      } catch (err) {
        UI.toast(err.message, 'error');
      } finally {
        btn.disabled = false; btn.textContent = 'Create Campaign';
      }
    });

    loadCampaigns();

    // Handle hash navigation.
    if (window.location.hash) {
      const id = window.location.hash.slice(1);
      if (id) showDetail(id);
    }
  
