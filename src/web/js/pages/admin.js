    initLayout();

    // ── Tabs ──────────────────────────────────────────────────────────────────
    function switchTab(name) {
      ['users','rules','audit'].forEach(t => {
        document.getElementById(`tab-${t}`).classList.toggle('hidden', t !== name);
        document.querySelector(`[data-tab="${t}"]`).classList.toggle('active', t === name);
      });
      if (name === 'users')  loadUsers();
      if (name === 'rules')  loadRules();
      if (name === 'audit')  loadAudit(1);
    }

    // ── Users ─────────────────────────────────────────────────────────────────
    async function loadUsers() {
      try {
        const { users } = await API.get('/admin/users');
        const tbody = document.getElementById('users-tbody');
        tbody.innerHTML = users.map(u => `<tr>
          <td><strong>${esc(u.username)}</strong></td>
          <td><span class="badge badge-info">${esc(u.role.toUpperCase())}</span></td>
          <td>${u.is_active
            ? '<span class="badge badge-success">Active</span>'
            : '<span class="badge badge-danger">Disabled</span>'}</td>
          <td class="table-actions">
            <button class="btn btn-secondary btn-sm" data-action="editUser" data-args="${esc(JSON.stringify([u.id, u.username, u.role, u.is_active]))}">Edit</button>
          </td>
        </tr>`).join('');
      } catch (err) { UI.toast(err.message, 'error'); }
    }

    document.getElementById('new-user-btn').addEventListener('click', () => {
      document.getElementById('user-form').reset();
      document.getElementById('user-id').value = '';
      document.getElementById('u-password-group').classList.remove('hidden');
      document.getElementById('u-active-group').classList.add('hidden');
      document.getElementById('user-modal-title').textContent = 'New User';
      document.getElementById('user-save-btn').textContent = 'Create User';
      UI.openModal('user-modal');
    });

    function editUser(id, username, role, isActive) {
      document.getElementById('user-id').value       = id;
      document.getElementById('u-username').value    = username;
      document.getElementById('u-username').disabled = true;
      document.getElementById('u-role').value        = role;
      document.getElementById('u-active').checked    = !!isActive;
      document.getElementById('u-password-group').classList.add('hidden');
      document.getElementById('u-active-group').classList.remove('hidden');
      document.getElementById('user-modal-title').textContent = 'Edit User';
      document.getElementById('user-save-btn').textContent = 'Save Changes';
      UI.openModal('user-modal');
    }

    document.getElementById('user-save-btn').addEventListener('click', () => {
      const id = document.getElementById('user-id').value;
      if (id) {
        // Update existing user — confirm required.
        UI.confirm('Update this user\'s role or status?', async () => {
          try {
            await API.put(`/admin/users/${id}`, {
              role:      document.getElementById('u-role').value,
              is_active: document.getElementById('u-active').checked,
              confirm:   true,
            });
            UI.closeModal('user-modal');
            UI.toast('User updated.', 'success');
            document.getElementById('u-username').disabled = false;
            loadUsers();
          } catch (err) { UI.toast(err.message, 'error'); }
        }, 'Update User');
      } else {
        // Create new user.
        (async () => {
          const btn = document.getElementById('user-save-btn');
          btn.disabled = true; btn.textContent = 'Creating…';
          try {
            await API.post('/admin/users', {
              username: document.getElementById('u-username').value.trim(),
              password: document.getElementById('u-password').value,
              role:     document.getElementById('u-role').value,
            });
            UI.closeModal('user-modal');
            UI.toast('User created.', 'success');
            loadUsers();
          } catch (err) {
            UI.toast(err.message, 'error');
          } finally {
            btn.disabled = false; btn.textContent = 'Create User';
          }
        })();
      }
    });

    // ── Rules ─────────────────────────────────────────────────────────────────
    let rules = [];

    async function loadRules() {
      try {
        const data = await API.get('/admin/rules');
        rules = data.rules;
        const tbody = document.getElementById('rules-tbody');
        tbody.innerHTML = rules.map(r => `<tr>
          <td><strong>${esc(r.rule_name)}</strong><br/><span class="text-muted" style="font-size:11px">${esc(r.rule_id)}</span></td>
          <td>v${esc(r.version)}</td>
          <td>${esc(r.weight)}</td>
          <td>${esc(r.threshold)}</td>
          <td>${r.is_active
            ? '<span class="badge badge-success">Active</span>'
            : '<span class="badge badge-neutral">Inactive</span>'}</td>
          <td>
            <button class="btn btn-secondary btn-sm" data-action="editRule" data-args="${esc(JSON.stringify([r.id]))}">Edit</button>
          </td>
        </tr>`).join('');
      } catch (err) { UI.toast(err.message, 'error'); }
    }

    function editRule(id) {
      const r = rules.find(x => x.id === id);
      if (!r) return;
      document.getElementById('rule-id').value       = r.id;
      document.getElementById('r-name').value        = `${esc(r.rule_name)} (${esc(r.rule_id)})`;
      document.getElementById('r-weight').value      = r.weight;
      document.getElementById('r-threshold').value   = r.threshold;
      document.getElementById('r-active').checked    = !!r.is_active;
      UI.openModal('rule-modal');
    }

    document.getElementById('rule-save-btn').addEventListener('click', () => {
      UI.confirm(
        'Update this rule? The version will increment and all future analyses will use the new settings.',
        async () => {
          const id = document.getElementById('rule-id').value;
          try {
            await API.put(`/admin/rules/${id}`, {
              weight:    parseFloat(document.getElementById('r-weight').value),
              threshold: parseFloat(document.getElementById('r-threshold').value),
              is_active: document.getElementById('r-active').checked,
              confirm:   true,
            });
            UI.closeModal('rule-modal');
            UI.toast('Rule updated. Version incremented.', 'success');
            loadRules();
          } catch (err) { UI.toast(err.message, 'error'); }
        },
        'Update Rule',
      );
    });

    // ── Audit log ─────────────────────────────────────────────────────────────
    let auditPage = 1;

    async function loadAudit(page) {
      auditPage = page;
      try {
        const data = await API.get(`/admin/audit?page=${page}&pageSize=20`);
        document.getElementById('audit-page-label').textContent = `Page ${page} of ${Math.ceil(data.total / 20) || 1}`;
        document.getElementById('audit-prev').disabled = page <= 1;
        document.getElementById('audit-next').disabled = data.rows.length < 20;

        const tbody = document.getElementById('audit-tbody');
        if (!data.rows.length) {
          tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state"><h3>No audit events yet</h3></div></td></tr>';
          return;
        }
        tbody.innerHTML = data.rows.map(r => `<tr>
          <td style="font-family:var(--font-mono);font-size:11px">${esc(r.seq)}</td>
          <td style="font-size:12px;color:var(--text-secondary)">${r.created_at ? new Date(r.created_at).toLocaleString() : '—'}</td>
          <td style="font-size:12px">${r.actor_role ? `<span class="badge badge-info" style="font-size:10px">${esc(r.actor_role)}</span>` : '<span class="text-muted">system</span>'}</td>
          <td style="font-family:var(--font-mono);font-size:12px">${esc(r.action)}</td>
          <td style="font-size:12px">${r.target_type ? esc(r.target_type) : '—'}</td>
          <td>${r.outcome === 'success'
            ? '<span class="badge badge-success">success</span>'
            : r.outcome === 'denied'
            ? '<span class="badge badge-warning">denied</span>'
            : '<span class="badge badge-danger">failure</span>'}</td>
        </tr>`).join('');
      } catch (err) { UI.toast(err.message, 'error'); }
    }

    document.getElementById('audit-prev').addEventListener('click', () => { if (auditPage > 1) loadAudit(auditPage - 1); });
    document.getElementById('audit-next').addEventListener('click', () => loadAudit(auditPage + 1));

    document.getElementById('verify-chain-btn').addEventListener('click', async () => {
      try {
        const result = await API.get('/admin/audit/verify');
        const div = document.getElementById('chain-result');
        div.classList.remove('hidden');
        if (result.ok) {
          div.className = 'alert alert-success';
          div.innerHTML = `✓ Audit chain verified — ${esc(result.totalRows)} events, no tampering detected.`;
        } else {
          div.className = 'alert alert-error';
          div.innerHTML = `✗ Chain integrity failure at seq=${esc(result.firstTamperedSeq)}.<br/>
            <ul style="margin-top:6px;font-size:12px;list-style:disc;padding-left:16px">
              ${result.errors.slice(0,5).map(e => `<li>${esc(e)}</li>`).join('')}
            </ul>`;
        }
      } catch (err) { UI.toast(err.message, 'error'); }
    });

    // Load users tab on mount.
    loadUsers();
  
