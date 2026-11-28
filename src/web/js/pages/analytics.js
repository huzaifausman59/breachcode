    initLayout();

    function pct(n, d) { return d > 0 ? ((n/d)*100).toFixed(1) + '%' : '0%'; }

    async function loadAnalytics() {
      const { campaigns } = await API.get('/campaigns');

      const preOpt  = document.getElementById('pre-select');
      const postOpt = document.getElementById('post-select');
      campaigns.filter(c => c.phase === 'pre').forEach(c => {
        preOpt.innerHTML  += `<option value="${esc(c.id)}">${esc(c.name)}</option>`;
      });
      campaigns.filter(c => c.phase === 'post').forEach(c => {
        postOpt.innerHTML += `<option value="${esc(c.id)}">${esc(c.name)}</option>`;
      });

      const summaries = await Promise.all(campaigns.map(c =>
        API.get(`/analytics/campaign/${c.id}`).catch(() => ({ summary: {} }))
      ));

      const tbody = document.getElementById('analytics-tbody');
      tbody.innerHTML = campaigns.map((c, i) => {
        const s = summaries[i]?.summary || {};
        return `<tr>
          <td>${esc(c.name)}</td>
          <td><span class="badge badge-info">${esc(c.phase.toUpperCase())}</span></td>
          <td>${UI.statusBadge(c.status)}</td>
          <td>${s.total_sent || 0}</td>
          <td>${pct(s.clicked   || 0, s.total_sent || 0)}</td>
          <td>${pct(s.submitted || 0, s.total_sent || 0)}</td>
          <td>${pct(s.reported  || 0, s.total_sent || 0)}</td>
        </tr>`;
      }).join('') || '<tr><td colspan="7"><div class="empty-state"><h3>No campaigns yet</h3></div></td></tr>';
    }

    document.getElementById('compare-btn').addEventListener('click', async () => {
      const preId  = document.getElementById('pre-select').value;
      const postId = document.getElementById('post-select').value;
      if (!preId || !postId) { UI.toast('Select both campaigns first.', 'warning'); return; }
      try {
        const { comparison } = await API.get(`/analytics/prepost/${preId}/${postId}`);
        const c = comparison;
        const div = document.getElementById('comparison-result');
        div.innerHTML = `
          <div class="${c.improved ? 'alert alert-success' : 'alert alert-warning'}" style="margin-bottom:16px">
            <strong>${c.improved ? '✓ Training improved results' : '⚠ No improvement detected'}</strong>
            — Improvement score: ${c.improvementScore > 0 ? '+' : ''}${esc(c.improvementScore)}pp
          </div>
          ${c.warnings.map(w => `<div class="alert alert-warning">${esc(w)}</div>`).join('')}
          <table>
            <thead><tr><th>Metric</th><th>Pre-Training</th><th>Post-Training</th><th>Delta</th></tr></thead>
            <tbody>
              <tr><td>Click Rate</td><td>${esc(c.pre.click_rate)}%</td><td>${esc(c.post.click_rate)}%</td>
                  <td class="${c.deltas.click_rate < 0 ? 'risk-low' : 'risk-high'}">${c.deltas.click_rate > 0 ? '+' : ''}${esc(c.deltas.click_rate)}pp</td></tr>
              <tr><td>Submit Rate</td><td>${esc(c.pre.submit_rate)}%</td><td>${esc(c.post.submit_rate)}%</td>
                  <td class="${c.deltas.submit_rate < 0 ? 'risk-low' : 'risk-high'}">${c.deltas.submit_rate > 0 ? '+' : ''}${esc(c.deltas.submit_rate)}pp</td></tr>
              <tr><td>Report Rate</td><td>${esc(c.pre.report_rate)}%</td><td>${esc(c.post.report_rate)}%</td>
                  <td class="${c.deltas.report_rate > 0 ? 'risk-low' : 'risk-high'}">${c.deltas.report_rate > 0 ? '+' : ''}${esc(c.deltas.report_rate)}pp</td></tr>
            </tbody>
          </table>
          <div style="margin-top:12px">
            ${c.interpretations.map(i => `<p class="text-sm" style="margin-top:4px">• ${esc(i)}</p>`).join('')}
          </div>`;
      } catch (err) { UI.toast(err.message, 'error'); }
    });

    loadAnalytics();
  
