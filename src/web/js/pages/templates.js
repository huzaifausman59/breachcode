    initLayout();
    let templates = [];

    async function loadTemplates() {
      try {
        const data = await API.get('/templates');
        templates = data.templates;
        renderTable();
      } catch (err) {
        UI.toast('Failed to load templates: ' + err.message, 'error');
      }
    }

    function renderTable() {
      const tbody = document.getElementById('template-tbody');
      if (templates.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6">
          <div class="empty-state">
            <h3>No templates yet</h3>
            <p>Create your first email template to get started.</p>
          </div>
        </td></tr>`;
        return;
      }

      tbody.innerHTML = templates.map(t => {
        let result = null;
        try { result = t.indicator_result ? JSON.parse(t.indicator_result) : null; } catch {}
        return `<tr>
          <td><strong>${esc(t.name)}</strong></td>
          <td>${esc(t.subject)}</td>
          <td>${esc(t.sender_name)} &lt;${esc(t.sender_email)}&gt;</td>
          <td>${result ? UI.riskBadge(result.risk_level) : '<span class="text-muted">—</span>'}</td>
          <td>${result ? `<strong>${esc(result.decision)}</strong>` : '—'}</td>
          <td class="table-actions">
            <button class="btn btn-secondary btn-sm" data-action="viewResult" data-args="${esc(JSON.stringify([t.id]))}">Result</button>
            <button class="btn btn-secondary btn-sm" data-action="editTemplate" data-args="${esc(JSON.stringify([t.id]))}">Edit</button>
            <button class="btn btn-danger btn-sm" data-action="deleteTemplate" data-args="${esc(JSON.stringify([t.id, t.name]))}">Delete</button>
          </td>
        </tr>`;
      }).join('');
    }

    async function viewResult(id) {
      try {
        const { result } = await API.get(`/templates/${id}`);
        const body = document.getElementById('result-modal-body');
        if (!result) { body.innerHTML = '<p>No analysis result yet. Save the template to run analysis.</p>'; }
        else {
          body.innerHTML = `
            <div class="flex items-center gap-md mb-md">
              ${UI.riskBadge(result.risk_level)}
              <strong>Decision: ${esc(result.decision)}</strong>
              <span class="text-muted text-sm">Score: ${(result.total_score || 0).toFixed(1)}</span>
            </div>
            <p class="mb-md">${esc(result.summary || '')}</p>
            ${result.reasons && result.reasons.length > 0 ? `
            <h3 style="font-size:14px;font-weight:700;margin-bottom:8px">Indicators found:</h3>
            <ul style="list-style:none;display:flex;flex-direction:column;gap:6px">
              ${result.reasons.map(r => `<li style="background:#fff8e1;border-left:3px solid #f39c12;padding:8px 12px;border-radius:0 4px 4px 0;font-size:13px">⚠️ ${esc(r)}</li>`).join('')}
            </ul>` : '<p class="text-muted">No phishing indicators detected.</p>'}
            <p class="text-sm text-muted mt-md">Engine version: ${esc(result.engine_version)} · Evaluated: ${result.created_at ? new Date(result.created_at).toLocaleString() : '—'}</p>`;
        }
        UI.openModal('result-modal');
      } catch (err) {
        UI.toast('Failed to load result: ' + err.message, 'error');
      }
    }

    function editTemplate(id) {
      const t = templates.find(x => x.id === id);
      if (!t) return;
      document.getElementById('template-id').value = t.id;
      document.getElementById('t-name').value        = t.name;
      document.getElementById('t-sender-name').value = t.sender_name;
      document.getElementById('t-sender-email').value= t.sender_email;
      document.getElementById('t-subject').value     = t.subject;
      document.getElementById('t-html-body').value   = t.html_body || '';
      document.getElementById('t-text-body').value   = t.text_body || '';
      document.getElementById('template-modal-title').textContent = 'Edit Template';
      UI.openModal('template-modal');
    }

    function deleteTemplate(id, name) {
      UI.confirm(`Delete template "${name}"? This cannot be undone.`, async () => {
        try {
          await API.delete(`/templates/${id}`);
          UI.toast('Template deleted.', 'success');
          loadTemplates();
        } catch (err) {
          UI.toast('Delete failed: ' + err.message, 'error');
        }
      }, 'Delete');
    }

    document.getElementById('new-template-btn').addEventListener('click', () => {
      document.getElementById('template-form').reset();
      document.getElementById('template-id').value = '';
      document.getElementById('template-modal-title').textContent = 'New Template';
      UI.openModal('template-modal');
    });

    document.getElementById('template-save-btn').addEventListener('click', async () => {
      const form = document.getElementById('template-form');
      UI.clearFieldErrors(form);
      const id = document.getElementById('template-id').value;

      const body = {
        name:         document.getElementById('t-name').value.trim(),
        sender_name:  document.getElementById('t-sender-name').value.trim(),
        sender_email: document.getElementById('t-sender-email').value.trim(),
        subject:      document.getElementById('t-subject').value.trim(),
        html_body:    document.getElementById('t-html-body').value,
        text_body:    document.getElementById('t-text-body').value || undefined,
      };

      const btn = document.getElementById('template-save-btn');
      btn.disabled = true; btn.textContent = 'Saving…';

      try {
        const data = id
          ? await API.put(`/templates/${id}`, body)
          : await API.post('/templates', body);
        UI.closeModal('template-modal');
        UI.toast('Template saved and analyzed.', 'success');
        loadTemplates();
      } catch (err) {
        if (err.fields) UI.showFieldErrors(form, err.fields);
        else UI.toast(err.message, 'error');
      } finally {
        btn.disabled = false; btn.textContent = 'Save & Analyze';
      }
    });

    loadTemplates();
  
