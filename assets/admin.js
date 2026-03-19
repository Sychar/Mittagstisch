(() => {
  const STORAGE = {
    token: 'mittagstisch.admin.token',
    apiBase: 'mittagstisch.admin.apiBase'
  };

  const loginPanel = document.querySelector('[data-admin-login-panel]');
  const loginForm = document.querySelector('[data-admin-login-form]');
  const loginError = document.querySelector('[data-admin-login-error]');
  const adminContent = document.querySelector('[data-admin-content]');
  const statusFilter = document.querySelector('[data-admin-status-filter]');
  const refreshButton = document.querySelector('[data-admin-refresh]');
  const logoutButton = document.querySelector('[data-admin-logout]');
  const statusNotice = document.querySelector('[data-admin-status]');
  const errorNotice = document.querySelector('[data-admin-error]');
  const requestList = document.querySelector('[data-admin-request-list]');
  const apiInput = document.querySelector('#apiBase');

  const defaultApiBase = (() => {
    if (window.location.protocol.startsWith('http')) {
      return `${window.location.protocol}//${window.location.hostname}:4000`;
    }
    return 'http://localhost:4000';
  })();

  let apiBase = localStorage.getItem(STORAGE.apiBase) || defaultApiBase;
  let token = localStorage.getItem(STORAGE.token) || '';

  const setLoginError = (message = '') => {
    if (!loginError) return;
    loginError.textContent = message;
    loginError.classList.toggle('hidden', !message);
  };

  const setGlobalError = (message = '') => {
    if (!errorNotice) return;
    errorNotice.textContent = message;
    errorNotice.classList.toggle('hidden', !message);
  };

  const setStatus = (message) => {
    if (!statusNotice) return;
    statusNotice.textContent = message;
  };

  const setAdminAuthState = (isAuthed) => {
    if (loginPanel) loginPanel.classList.toggle('hidden', isAuthed);
    if (adminContent) adminContent.classList.toggle('hidden', !isAuthed);
  };

  const request = async (path, options = {}) => {
    const response = await fetch(`${apiBase}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token
          ? {
              Authorization: `Bearer ${token}`
            }
          : {}),
        ...(options.headers || {})
      }
    });

    const text = await response.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch (error) {
        data = null;
      }
    }

    if (!response.ok) {
      const message = data?.message || `Request failed (${response.status})`;
      throw new Error(message);
    }

    return data;
  };

  const formatDate = (value) => {
    if (!value) return '--';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '--';
    return date.toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const statusLabel = (status) => {
    if (status === 'approved') return 'Freigeschaltet';
    if (status === 'rejected') return 'Abgelehnt';
    return 'Wartend';
  };

  const createEmptyState = (message) => {
    const item = document.createElement('div');
    item.className = 'list-item';
    item.textContent = message;
    return item;
  };

  const createRequestCard = (restaurant, selectedStatus) => {
    const card = document.createElement('div');
    card.className = 'list-item admin-request-card';

    const title = document.createElement('strong');
    title.textContent = restaurant.name;

    const meta = document.createElement('span');
    meta.textContent = `${restaurant.email} | ${restaurant.phone}`;

    const details = document.createElement('span');
    details.textContent = `${restaurant.address} | PLZ ${restaurant.postalCode}`;

    const state = document.createElement('span');
    state.className = 'admin-status-badge';
    state.textContent = statusLabel(restaurant.approvalStatus);

    const submitted = document.createElement('span');
    submitted.className = 'notice subtle';
    submitted.textContent = `Angefragt am: ${formatDate(restaurant.approvalRequestedAt)}`;

    card.appendChild(title);
    card.appendChild(meta);
    card.appendChild(details);
    card.appendChild(state);
    card.appendChild(submitted);

    if (restaurant.approvalReviewedAt) {
      const reviewed = document.createElement('span');
      reviewed.className = 'notice subtle';
      reviewed.textContent = `Geprüft am: ${formatDate(restaurant.approvalReviewedAt)}`;
      card.appendChild(reviewed);
    }

    if (restaurant.approvalNote) {
      const note = document.createElement('span');
      note.className = 'notice subtle';
      note.textContent = `Notiz: ${restaurant.approvalNote}`;
      card.appendChild(note);
    }

    if (selectedStatus === 'pending') {
      const noteField = document.createElement('textarea');
      noteField.className = 'admin-note';
      noteField.placeholder = 'Optionale Notiz (z.B. Rückfrage oder Grund)';

      const actions = document.createElement('div');
      actions.className = 'input-row';

      const approveButton = document.createElement('button');
      approveButton.className = 'button';
      approveButton.type = 'button';
      approveButton.textContent = 'Freischalten';

      const rejectButton = document.createElement('button');
      rejectButton.className = 'button ghost';
      rejectButton.type = 'button';
      rejectButton.textContent = 'Ablehnen';

      const handleDecision = async (decision) => {
        setGlobalError('');
        setStatus('Speichere Entscheidung...');
        approveButton.disabled = true;
        rejectButton.disabled = true;

        try {
          await request(`/api/admin/restaurants/${restaurant.id}/review`, {
            method: 'PATCH',
            body: JSON.stringify({
              decision,
              note: (noteField.value || '').trim() || undefined
            })
          });
          setStatus('Entscheidung gespeichert.');
          await loadRequests();
        } catch (error) {
          setGlobalError(error instanceof Error ? error.message : 'Entscheidung fehlgeschlagen.');
          setStatus('Fehler beim Speichern.');
          approveButton.disabled = false;
          rejectButton.disabled = false;
        }
      };

      approveButton.addEventListener('click', () => handleDecision('approve'));
      rejectButton.addEventListener('click', () => handleDecision('reject'));

      actions.appendChild(approveButton);
      actions.appendChild(rejectButton);

      card.appendChild(noteField);
      card.appendChild(actions);
    }

    return card;
  };

  const loadRequests = async () => {
    if (!token) return;
    const selectedStatus = statusFilter?.value || 'pending';

    setGlobalError('');
    setStatus('Lade Anfragen...');
    if (requestList) requestList.innerHTML = '';

    try {
      const restaurants = await request(`/api/admin/restaurants?status=${encodeURIComponent(selectedStatus)}`);

      if (!requestList) return;

      if (!Array.isArray(restaurants) || restaurants.length === 0) {
        requestList.appendChild(createEmptyState('Keine Einträge für diesen Status gefunden.'));
        setStatus('Keine Einträge gefunden.');
        return;
      }

      restaurants.forEach((restaurant) => {
        requestList.appendChild(createRequestCard(restaurant, selectedStatus));
      });
      setStatus(`Gefunden: ${restaurants.length} Einträge (${statusLabel(selectedStatus)}).`);
    } catch (error) {
      if (error instanceof Error && error.message.includes('Admin authentication required')) {
        token = '';
        localStorage.removeItem(STORAGE.token);
        setAdminAuthState(false);
        setLoginError('Session abgelaufen. Bitte erneut einloggen.');
        return;
      }

      const message = error instanceof Error ? error.message : 'Anfragen konnten nicht geladen werden.';
      setGlobalError(message);
      setStatus('Fehler beim Laden.');
    }
  };

  const bootstrap = async () => {
    if (apiInput) apiInput.value = apiBase;

    if (!token) {
      setAdminAuthState(false);
      return;
    }

    setAdminAuthState(true);
    await loadRequests();
  };

  if (loginForm) {
    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      setLoginError('');
      setGlobalError('');

      const formData = new FormData(loginForm);
      apiBase = (formData.get('apiBase') || '').toString().trim().replace(/\/+$/, '');
      const email = (formData.get('adminEmail') || '').toString().trim();
      const password = (formData.get('adminPassword') || '').toString();

      if (!apiBase || !email || !password) {
        setLoginError('Bitte alle Felder ausfüllen.');
        return;
      }

      try {
        const data = await request('/api/admin/login', {
          method: 'POST',
          headers: {},
          body: JSON.stringify({ email, password })
        });

        token = data.token || '';
        if (!token) {
          setLoginError('Login fehlgeschlagen.');
          return;
        }

        localStorage.setItem(STORAGE.token, token);
        localStorage.setItem(STORAGE.apiBase, apiBase);
        setAdminAuthState(true);
        await loadRequests();
      } catch (error) {
        setLoginError(error instanceof Error ? error.message : 'Admin Login fehlgeschlagen.');
      }
    });
  }

  if (refreshButton) {
    refreshButton.addEventListener('click', () => {
      loadRequests();
    });
  }

  if (statusFilter) {
    statusFilter.addEventListener('change', () => {
      loadRequests();
    });
  }

  if (logoutButton) {
    logoutButton.addEventListener('click', async () => {
      try {
        await request('/api/admin/logout', { method: 'POST', body: JSON.stringify({}) });
      } catch {
        // ignore logout failures and clear local state anyway
      }

      token = '';
      localStorage.removeItem(STORAGE.token);
      setAdminAuthState(false);
      setStatus('Bitte einloggen.');
      if (requestList) requestList.innerHTML = '';
    });
  }

  bootstrap();
})();

