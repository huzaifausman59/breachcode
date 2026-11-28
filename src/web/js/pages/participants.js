    initLayout();

    async function loadParticipants() {
      try {
        const { participants } = await API.get('/participants');
        const tbody = document.getElementById('participant-tbody');
        if (!participants.length) {
          tbody.innerHTML = `<tr><td colspan="5">
            <div class="empty-state">
              <h3>No participants yet</h3>
              <p>Import a CSV file with consented participants.</p>
            </div>
          </td></tr>`;
          return;
        }
        tbody.innerHTML = participants.map(p => `<tr>
          <td>${esc(p.email)}</td>
          <td>${p.display_name ? esc(p.display_name) : '<span class="text-muted">—</span>'}</td>
          <td>${p.consent_status === 'active'
            ? '<span class="badge badge-success">Active</span>'
            : '<span class="badge badge-danger">Withdrawn</span>'}</td>
          <td>${p.consent_at ? new Date(p.consent_at).toLocaleDateString() : '—'}</td>
          <td>${p.opt_out_at ? `<span class="badge badge-warning">${new Date(p.opt_out_at).toLocaleDateString()}</span>` : '<span class="text-muted">—</span>'}</td>
        </tr>`).join('');
      } catch (err) {
        UI.toast('Failed to load participants: ' + err.message, 'error');
      }
    }

    document.getElementById('import-btn').addEventListener('click', () => {
      document.getElementById('csv-file').value = '';
      document.getElementById('import-result').classList.add('hidden');
      UI.openModal('import-modal');
    });

    document.getElementById('import-confirm-btn').addEventListener('click', () => {
      UI.confirm(
        'Confirm bulk import? All rows with valid consent will be imported.',
        async () => {
          const file = document.getElementById('csv-file').files[0];
          if (!file) { UI.toast('Please select a CSV file.', 'warning'); return; }

          const fd = new FormData();
          fd.append('file', file);
          fd.append('confirm', 'true');

          const btn = document.getElementById('import-confirm-btn');
          btn.disabled = true; btn.textContent = 'Importing…';

          try {
            const result = await API.upload('/participants/import', fd);
            const resDiv = document.getElementById('import-result');
            resDiv.className = `alert ${result.skipped > 0 ? 'alert-warning' : 'alert-success'}`;
            resDiv.classList.remove('hidden');
            resDiv.innerHTML = `<div>
              <strong>Import complete:</strong> ${esc(result.imported)} imported, ${esc(result.skipped)} skipped.
              ${result.errors && result.errors.length > 0 ? `
                <ul style="margin-top:8px;font-size:12px;list-style:disc;padding-left:16px">
                  ${result.errors.slice(0, 5).map(e => `<li>Row ${esc(e.row)}: ${esc(e.error)}</li>`).join('')}
                  ${result.errors.length > 5 ? `<li>…and ${result.errors.length - 5} more</li>` : ''}
                </ul>` : ''}
            </div>`;
            if (result.imported > 0) loadParticipants();
          } catch (err) {
            UI.toast('Import failed: ' + err.message, 'error');
          } finally {
            btn.disabled = false; btn.textContent = 'Import';
          }
        },
        'Import',
      );
    });

    loadParticipants();
  
