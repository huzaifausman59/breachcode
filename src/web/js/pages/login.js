    // Redirect if already logged in.
    API.get('/auth/me').then(() => { window.location.href = '/dashboard.html'; }).catch(() => {});

    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button[type="submit"]');
      const errBox = document.getElementById('login-error');
      errBox.classList.add('hidden');
      btn.disabled = true;
      btn.textContent = 'Signing in…';

      const username = document.getElementById('username').value.trim();
      const password = document.getElementById('password').value;

      try {
        await API.post('/auth/login', { username, password });
        window.location.href = '/dashboard.html';
      } catch (err) {
        errBox.textContent = err.message || 'Login failed. Please try again.';
        errBox.classList.remove('hidden');
        btn.disabled = false;
        btn.textContent = 'Sign in';
        document.getElementById('password').value = '';
        document.getElementById('username').focus();
      }
    });
  
