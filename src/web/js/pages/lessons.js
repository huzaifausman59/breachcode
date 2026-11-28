    initLayout();
    let lessons = [], templates = [];

    async function load() {
      try {
        [{ lessons }, { templates }] = await Promise.all([
          API.get('/lessons'),
          API.get('/templates'),
        ]);
        renderTable();
      } catch (err) {
        UI.toast('Failed to load: ' + err.message, 'error');
      }
    }

    function renderTable() {
      const tbody = document.getElementById('lesson-tbody');
      if (!lessons.length) {
        tbody.innerHTML = `<tr><td colspan="5">
          <div class="empty-state">
            <h3>No lessons yet</h3>
            <p>Create micro-lessons to educate participants after they click a phishing link.</p>
          </div>
        </td></tr>`;
        return;
      }
      tbody.innerHTML = lessons.map(l => {
        const tmpl = templates.find(t => t.id === l.template_id);
        let indicators = [];
        try { indicators = JSON.parse(l.indicators || '[]'); } catch {}
        return `<tr>
          <td><strong>${esc(l.title)}</strong></td>
          <td>${tmpl ? esc(tmpl.name) : '<span class="text-muted">Unknown</span>'}</td>
          <td>${indicators.length > 0
            ? indicators.slice(0, 2).map(i => `<span class="badge badge-warning" style="margin-right:4px">${esc(i.slice(0,40))}${i.length > 40 ? '…' : ''}</span>`).join('') + (indicators.length > 2 ? `<span class="text-muted text-sm">+${indicators.length - 2} more</span>` : '')
            : '<span class="text-muted">—</span>'}</td>
          <td>${l.updated_at ? new Date(l.updated_at).toLocaleDateString() : '—'}</td>
          <td class="table-actions">
            <button class="btn btn-secondary btn-sm" data-action="editLesson" data-args="${esc(JSON.stringify([l.id]))}">Edit</button>
          </td>
        </tr>`;
      }).join('');
    }

    function populateTemplateSelect(selectedId) {
      const sel = document.getElementById('l-template');
      sel.innerHTML = '<option value="">— Select template —</option>' +
        templates.map(t => `<option value="${esc(t.id)}" ${t.id === selectedId ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
    }

    async function prefillFromAnalysis(templateId) {
      if (!templateId) return;
      try {
        const { result } = await API.get(`/templates/${templateId}`);
        if (result && result.indicators_matched && result.indicators_matched.length > 0) {
          document.getElementById('l-indicators').value = result.indicators_matched.join('\n');
          UI.toast('Indicators pre-filled from template analysis.', 'success');
        }
      } catch {}
    }

    document.getElementById('new-lesson-btn').addEventListener('click', () => {
      document.getElementById('lesson-form').reset();
      document.getElementById('lesson-id').value = '';
      document.getElementById('lesson-modal-title').textContent = 'New Lesson';
      populateTemplateSelect('');
      UI.openModal('lesson-modal');
    });

    document.getElementById('l-template').addEventListener('change', (e) => {
      if (!document.getElementById('lesson-id').value) {
        prefillFromAnalysis(e.target.value);
      }
    });

    function editLesson(id) {
      const l = lessons.find(x => x.id === id);
      if (!l) return;
      let indicators = [];
      try { indicators = JSON.parse(l.indicators || '[]'); } catch {}
      document.getElementById('lesson-id').value  = l.id;
      document.getElementById('l-title').value    = l.title;
      document.getElementById('l-content').value  = l.content_html;
      document.getElementById('l-indicators').value = indicators.join('\n');
      document.getElementById('lesson-modal-title').textContent = 'Edit Lesson';
      populateTemplateSelect(l.template_id);
      UI.openModal('lesson-modal');
    }

    document.getElementById('lesson-save-btn').addEventListener('click', async () => {
      const btn = document.getElementById('lesson-save-btn');
      btn.disabled = true; btn.textContent = 'Saving…';
      const id = document.getElementById('lesson-id').value;
      const indicators = document.getElementById('l-indicators').value
        .split('\n').map(s => s.trim()).filter(Boolean);

      const body = {
        template_id:  document.getElementById('l-template').value,
        title:        document.getElementById('l-title').value.trim(),
        content_html: document.getElementById('l-content').value,
        indicators,
      };

      try {
        if (id) await API.put(`/lessons/${id}`, body);
        else    await API.post('/lessons', body);
        UI.closeModal('lesson-modal');
        UI.toast('Lesson saved.', 'success');
        load();
      } catch (err) {
        if (err.fields) UI.showFieldErrors(document.getElementById('lesson-form'), err.fields);
        else UI.toast(err.message, 'error');
      } finally {
        btn.disabled = false; btn.textContent = 'Save Lesson';
      }
    });

    load();
  
