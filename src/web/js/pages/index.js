    API.get('/auth/me')
      .then(() => { window.location.replace('/dashboard.html'); })
      .catch(() => { window.location.replace('/login.html'); });
  
