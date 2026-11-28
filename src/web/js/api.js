/**
 * API fetch wrapper.
 * Automatically reads the __csrf cookie and sends it in X-CSRF-Token.
 * Redirects to /login.html on 401.
 * Throws structured errors with code + message on failure.
 */

function getCsrfToken() {
  const match = document.cookie.match(/(?:^|;\s*)__csrf=([^;]+)/);
  return match ? match[1] : '';
}

function isLoginPage() {
  return window.location.pathname.endsWith('/login.html');
}

async function api(method, path, body) {
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': getCsrfToken(),
    },
    credentials: 'same-origin',
  };
  if (body !== undefined) opts.body = JSON.stringify(body);

  const res = await fetch('/api/v1' + path, opts);

  // 401 = not signed in / session expired. Redirect, but NOT on the login page
  // itself or for the login call (otherwise: infinite reload loop, and a wrong
  // password would never show its error message).
  if (res.status === 401 && path !== '/auth/login' && !isLoginPage()) {
    window.location.href = '/login.html';
    return new Promise(() => {}); // never resolves: stops callers running on undefined data
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = new Error(data?.error?.message || 'Request failed');
    err.code   = data?.error?.code   || 'E_UNKNOWN';
    err.fields = data?.error?.fields || [];
    err.status = res.status;
    throw err;
  }

  return data;
}

async function apiUpload(path, formData) {
  const res = await fetch('/api/v1' + path, {
    method: 'POST',
    headers: { 'X-CSRF-Token': getCsrfToken() },
    credentials: 'same-origin',
    body: formData,
  });

  if (res.status === 401 && !isLoginPage()) { window.location.href = '/login.html'; return new Promise(() => {}); }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = new Error(data?.error?.message || 'Upload failed');
    err.code   = data?.error?.code   || 'E_UNKNOWN';
    err.fields = data?.error?.fields || [];
    err.status = res.status;
    throw err;
  }

  return data;
}

// Convenience methods.
const API = {
  get:    (path)         => api('GET',    path),
  post:   (path, body)   => api('POST',   path, body),
  put:    (path, body)   => api('PUT',    path, body),
  delete: (path)         => api('DELETE', path),
  upload: (path, fd)     => apiUpload(path, fd),
};

window.API = API;
