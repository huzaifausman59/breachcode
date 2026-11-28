/**
 * UI utility functions used across all pages.
 * Toast notifications, modal helpers, confirm dialog, stat ring renderer.
 */

// ── HTML escaping (XSS defence) ───────────────────────────────────────────────
// Every server-supplied value interpolated into an innerHTML template MUST go
// through esc(). Escapes quotes too, so it is safe inside attribute values.
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}

// ── Delegated click handling ─────────────────────────────────────────────────
// The server sends a strict CSP (script-src 'self'), which blocks inline
// onclick="..." handlers. Markup uses data attributes instead:
//   data-close-modal="modal-id"                 -> closes that modal
//   data-action="fnName" data-args='[...json]'  -> calls window.fnName(...args)
document.addEventListener('click', (e) => {
  const closer = e.target.closest('[data-close-modal]');
  if (closer) { closeModal(closer.dataset.closeModal); return; }

  const el = e.target.closest('[data-action]');
  if (!el) return;
  const fn = window[el.dataset.action];
  if (typeof fn !== 'function') return;
  if (el.tagName === 'A') e.preventDefault();
  let args = [];
  try { args = JSON.parse(el.dataset.args || '[]'); } catch { args = []; }
  fn(...args);
});

// ── Toast ────────────────────────────────────────────────────────────────────
let _toastContainer = null;

function getToastContainer() {
  if (!_toastContainer) {
    _toastContainer = document.createElement('div');
    _toastContainer.className = 'toast-container';
    _toastContainer.setAttribute('aria-live', 'polite');
    _toastContainer.setAttribute('aria-atomic', 'true');
    document.body.appendChild(_toastContainer);
  }
  return _toastContainer;
}

function toast(message, type = 'success', duration = 4000) {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.setAttribute('role', 'status');
  el.textContent = message;
  getToastContainer().appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, duration);
}

// ── Modal ────────────────────────────────────────────────────────────────────
function openModal(id) {
  const el = document.getElementById(id);
  if (el) { el.classList.remove('hidden'); document.body.style.overflow = 'hidden'; }
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) { el.classList.add('hidden'); document.body.style.overflow = ''; }
}

// Close modal on backdrop click.
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-backdrop')) {
    e.target.classList.add('hidden');
    document.body.style.overflow = '';
  }
});

// Close modal on Escape key.
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-backdrop:not(.hidden)').forEach((el) => {
      el.classList.add('hidden');
      document.body.style.overflow = '';
    });
  }
});

// ── Confirm dialog ────────────────────────────────────────────────────────────
function confirm(message, onConfirm, dangerLabel = 'Confirm') {
  let dlg = document.getElementById('_confirm_dialog');
  if (!dlg) {
    dlg = document.createElement('div');
    dlg.id = '_confirm_dialog';
    dlg.className = 'modal-backdrop hidden';
    dlg.setAttribute('role', 'dialog');
    dlg.setAttribute('aria-modal', 'true');
    dlg.setAttribute('aria-label', 'Confirm action');
    dlg.innerHTML = `
      <div class="modal confirm-modal">
        <div class="modal-body">
          <div class="confirm-icon">
            <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
          </div>
          <div class="confirm-title">Are you sure?</div>
          <p class="confirm-text" id="_confirm_text"></p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="_confirm_cancel">Cancel</button>
          <button class="btn btn-danger"    id="_confirm_ok"></button>
        </div>
      </div>`;
    document.body.appendChild(dlg);
    document.getElementById('_confirm_cancel').addEventListener('click', () => {
      dlg.classList.add('hidden');
      document.body.style.overflow = '';
    });
  }

  document.getElementById('_confirm_text').textContent = message;
  document.getElementById('_confirm_ok').textContent   = dangerLabel;
  dlg.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  document.getElementById('_confirm_ok').focus();

  // Replace listener.
  const btn = document.getElementById('_confirm_ok');
  const newBtn = btn.cloneNode(true);
  newBtn.textContent = dangerLabel;
  btn.parentNode.replaceChild(newBtn, btn);
  newBtn.addEventListener('click', () => {
    dlg.classList.add('hidden');
    document.body.style.overflow = '';
    onConfirm();
  });
}

// ── Stat ring renderer ────────────────────────────────────────────────────────
/**
 * Render a GoPhish-style donut stat card.
 * @param {string} label
 * @param {number} value
 * @param {number} total
 * @param {string} color  CSS color
 * @returns {HTMLElement}
 */
function statCard(label, value, total, color) {
  const radius = 30;
  const circ   = 2 * Math.PI * radius;
  const pct    = total > 0 ? value / total : 0;
  const dash   = pct * circ;

  const card = document.createElement('div');
  card.className = 'stat-card';
  card.innerHTML = `
    <div class="stat-ring" aria-label="${label}: ${value}">
      <svg viewBox="0 0 72 72" width="80" height="80">
        <circle class="stat-ring-bg" cx="36" cy="36" r="${radius}"/>
        <circle class="stat-ring-fill"
          cx="36" cy="36" r="${radius}"
          stroke="${color}"
          stroke-dasharray="${dash.toFixed(2)} ${(circ - dash).toFixed(2)}"
          stroke-dashoffset="0"/>
      </svg>
      <div class="stat-value">${value}</div>
    </div>
    <div class="stat-label">${label}</div>`;
  return card;
}

// ── Form helpers ──────────────────────────────────────────────────────────────
function showFieldErrors(form, fields) {
  // Clear previous errors.
  form.querySelectorAll('.field-error').forEach(el => el.remove());
  form.querySelectorAll('.input-error').forEach(el => el.classList.remove('input-error'));

  for (const { field, message } of (fields || [])) {
    const input = form.querySelector(`[name="${field}"]`);
    if (input) {
      input.classList.add('input-error');
      const err = document.createElement('p');
      err.className = 'field-error';
      err.textContent = message;
      input.parentNode.insertBefore(err, input.nextSibling);
    }
  }
}

function clearFieldErrors(form) {
  form.querySelectorAll('.field-error').forEach(el => el.remove());
  form.querySelectorAll('.input-error').forEach(el => el.classList.remove('input-error'));
}

// ── Active nav link ───────────────────────────────────────────────────────────
function setActiveNav() {
  const path = window.location.pathname;
  document.querySelectorAll('.sidebar-nav a').forEach(a => {
    a.classList.toggle('active', a.getAttribute('href') === path);
  });
}

// ── Badge helper ──────────────────────────────────────────────────────────────
function riskBadge(level) {
  const map = { high: 'danger', medium: 'warning', low: 'success' };
  return `<span class="badge badge-${map[level] || 'neutral'}">${esc((level || 'low').toUpperCase())}</span>`;
}

function statusBadge(status) {
  const map = {
    draft:     'neutral', sending: 'info', active: 'info',
    completed: 'success', cancelled: 'danger',
  };
  return `<span class="badge badge-${map[status] || 'neutral'}">${esc(status)}</span>`;
}

window.esc = esc;
window.UI = { esc, toast, openModal, closeModal, confirm, statCard, showFieldErrors, clearFieldErrors, setActiveNav, riskBadge, statusBadge };
