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
  const passwordForm = document.querySelector('[data-admin-password-form]');
  const passwordStatus = document.querySelector('[data-admin-password-status]');
  const reviewReportStatusFilter = document.querySelector('[data-review-report-status-filter]');
  const reviewReportRefreshButton = document.querySelector('[data-review-report-refresh]');
  const reviewReportStatus = document.querySelector('[data-review-report-status]');
  const reviewReportError = document.querySelector('[data-review-report-error]');
  const reviewReportList = document.querySelector('[data-review-report-list]');
  const highlightCandidateType = document.querySelector('[data-highlight-candidate-type]');
  const highlightCandidateSearch = document.querySelector('[data-highlight-candidate-search]');
  const highlightCandidateLoad = document.querySelector('[data-highlight-candidate-load]');
  const highlightCandidateList = document.querySelector('[data-highlight-candidate-list]');
  const highlightList = document.querySelector('[data-highlight-list]');
  const highlightStatus = document.querySelector('[data-highlight-status]');
  const highlightError = document.querySelector('[data-highlight-error]');

  const defaultApiBase = (() => {
    if (window.location.protocol.startsWith('http')) {
      if (window.location.hostname === 'admin.mymittagstisch.jetzt') {
        return 'https://api.mymittagstisch.jetzt';
      }

      if (window.location.hostname.startsWith('admin.')) {
        const rootDomain = window.location.hostname.slice('admin.'.length);
        return `${window.location.protocol}//api.${rootDomain}`;
      }

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

  const setPasswordStatus = (message = '', isError = false) => {
    if (!passwordStatus) return;
    passwordStatus.textContent = message;
    passwordStatus.classList.toggle('hidden', !message);
    passwordStatus.classList.toggle('warn', Boolean(message && isError));
    passwordStatus.classList.toggle('subtle', Boolean(message && !isError));
  };

  const setReviewReportStatus = (message = '') => {
    if (reviewReportStatus) reviewReportStatus.textContent = message;
  };

  const setReviewReportError = (message = '') => {
    if (!reviewReportError) return;
    reviewReportError.textContent = message;
    reviewReportError.classList.toggle('hidden', !message);
  };

  const setAdminAuthState = (isAuthed) => {
    if (loginPanel) loginPanel.classList.toggle('hidden', isAuthed);
    if (adminContent) adminContent.classList.toggle('hidden', !isAuthed);
  };

  const request = async (path, options = {}) => {
    const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
    const response = await fetch(`${apiBase}${path}`, {
      ...options,
      headers: {
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
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

  const setHighlightStatus = (message = '') => {
    if (highlightStatus) highlightStatus.textContent = message;
  };

  const setHighlightError = (message = '') => {
    if (!highlightError) return;
    highlightError.textContent = message;
    highlightError.classList.toggle('hidden', !message);
  };

  const highlightTypeLabel = (type) => {
    if (type === 'event') return 'Event';
    if (type === 'offer') return 'Angebot';
    return 'Restaurant';
  };

  const createHighlightPreview = (item) => {
    const wrap = document.createElement('div');
    wrap.className = 'admin-highlight-preview';
    if (item.imageUrl) {
      const image = document.createElement('img');
      image.src = item.imageUrl;
      image.alt = '';
      wrap.appendChild(image);
    } else {
      const fallback = document.createElement('span');
      fallback.textContent = highlightTypeLabel(item.type).slice(0, 1);
      wrap.appendChild(fallback);
    }
    return wrap;
  };

  const createHighlightCandidateCard = (candidate) => {
    const card = document.createElement('article');
    card.className = 'list-item admin-highlight-card';
    card.appendChild(createHighlightPreview(candidate));
    const content = document.createElement('div');
    content.className = 'admin-highlight-card-content';
    const title = document.createElement('strong');
    title.textContent = candidate.title;
    const meta = document.createElement('span');
    meta.textContent = `${highlightTypeLabel(candidate.type)} · ${candidate.subtitle || ''}`;
    content.appendChild(title);
    content.appendChild(meta);
    const button = document.createElement('button');
    button.className = 'button';
    button.type = 'button';
    button.textContent = candidate.highlighted ? 'Bereits gewählt' : 'Als Highlight';
    button.disabled = Boolean(candidate.highlighted);
    button.addEventListener('click', async () => {
      button.disabled = true;
      setHighlightError('');
      try {
        await request('/api/admin/highlights', {
          method: 'POST',
          body: JSON.stringify({ type: candidate.type, targetId: candidate.targetId })
        });
        await Promise.all([loadHighlights(), loadHighlightCandidates()]);
      } catch (error) {
        setHighlightError(error instanceof Error ? error.message : 'Highlight konnte nicht angelegt werden.');
        button.disabled = false;
      }
    });
    card.appendChild(content);
    card.appendChild(button);
    return card;
  };

  const updateHighlightOrder = async (items, index, direction) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= items.length) return;
    const current = items[index];
    const other = items[nextIndex];
    await Promise.all([
      request(`/api/admin/highlights/${encodeURIComponent(current.id)}`, {
        method: 'PATCH', body: JSON.stringify({ sortOrder: nextIndex * 10 })
      }),
      request(`/api/admin/highlights/${encodeURIComponent(other.id)}`, {
        method: 'PATCH', body: JSON.stringify({ sortOrder: index * 10 })
      })
    ]);
  };

  const createHighlightCard = (item, index, items) => {
    const card = document.createElement('article');
    card.className = `list-item admin-highlight-card${item.active ? '' : ' admin-highlight-card-offline'}`;
    card.appendChild(createHighlightPreview(item));
    const content = document.createElement('div');
    content.className = 'admin-highlight-card-content';
    const title = document.createElement('strong');
    title.textContent = `${index + 1}. ${item.title}`;
    const meta = document.createElement('span');
    meta.textContent = `${highlightTypeLabel(item.type)} · ${item.subtitle || ''}`;
    const imageLabel = document.createElement('label');
    imageLabel.className = 'button ghost admin-highlight-image-button';
    imageLabel.textContent = item.customImageUrl ? 'Titelbild ändern' : 'Eigenes Titelbild';
    const imageInput = document.createElement('input');
    imageInput.type = 'file';
    imageInput.accept = 'image/jpeg,image/png,image/webp';
    imageInput.hidden = true;
    imageInput.addEventListener('change', async () => {
      const file = imageInput.files?.[0];
      if (!file) return;
      const formData = new FormData();
      formData.append('file', file);
      setHighlightStatus('Titelbild wird hochgeladen...');
      try {
        await request(`/api/admin/highlights/${encodeURIComponent(item.id)}/image`, { method: 'POST', body: formData });
        await loadHighlights();
      } catch (error) {
        setHighlightError(error instanceof Error ? error.message : 'Bild konnte nicht hochgeladen werden.');
      }
    });
    imageLabel.appendChild(imageInput);
    content.appendChild(title);
    content.appendChild(meta);
    content.appendChild(imageLabel);

    const actions = document.createElement('div');
    actions.className = 'admin-highlight-actions';
    const up = document.createElement('button');
    up.className = 'button ghost'; up.type = 'button'; up.textContent = '↑'; up.disabled = index === 0;
    const down = document.createElement('button');
    down.className = 'button ghost'; down.type = 'button'; down.textContent = '↓'; down.disabled = index === items.length - 1;
    const toggle = document.createElement('button');
    toggle.className = 'button ghost'; toggle.type = 'button'; toggle.textContent = item.active ? 'Deaktivieren' : 'Aktivieren';
    const remove = document.createElement('button');
    remove.className = 'button danger'; remove.type = 'button'; remove.textContent = 'Entfernen';
    up.addEventListener('click', async () => { await updateHighlightOrder(items, index, -1); await loadHighlights(); });
    down.addEventListener('click', async () => { await updateHighlightOrder(items, index, 1); await loadHighlights(); });
    toggle.addEventListener('click', async () => {
      await request(`/api/admin/highlights/${encodeURIComponent(item.id)}`, { method: 'PATCH', body: JSON.stringify({ active: !item.active }) });
      await loadHighlights();
    });
    remove.addEventListener('click', async () => {
      if (!window.confirm(`Highlight „${item.title}“ entfernen?`)) return;
      await request(`/api/admin/highlights/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
      await Promise.all([loadHighlights(), loadHighlightCandidates()]);
    });
    actions.append(up, down, toggle, remove);
    card.append(content, actions);
    return card;
  };

  const loadHighlights = async () => {
    if (!token || !highlightList) return;
    setHighlightError('');
    setHighlightStatus('Highlights werden geladen...');
    highlightList.innerHTML = '';
    try {
      const items = await request('/api/admin/highlights');
      if (!Array.isArray(items) || !items.length) {
        highlightList.appendChild(createEmptyState('Noch keine Highlights ausgewählt.'));
        setHighlightStatus('Noch keine Highlights ausgewählt.');
        return;
      }
      items.forEach((item, index) => highlightList.appendChild(createHighlightCard(item, index, items)));
      setHighlightStatus(`${items.filter((item) => item.active).length} aktive Highlights.`);
    } catch (error) {
      setHighlightError(error instanceof Error ? error.message : 'Highlights konnten nicht geladen werden.');
    }
  };

  const loadHighlightCandidates = async () => {
    if (!token || !highlightCandidateList) return;
    highlightCandidateList.innerHTML = '';
    const params = new URLSearchParams();
    if (highlightCandidateType?.value) params.set('type', highlightCandidateType.value);
    if (highlightCandidateSearch?.value?.trim()) params.set('query', highlightCandidateSearch.value.trim());
    try {
      const items = await request(`/api/admin/highlights/candidates?${params.toString()}`);
      if (!Array.isArray(items) || !items.length) {
        highlightCandidateList.appendChild(createEmptyState('Keine passenden Inhalte gefunden.'));
        return;
      }
      items.forEach((item) => highlightCandidateList.appendChild(createHighlightCandidateCard(item)));
    } catch (error) {
      setHighlightError(error instanceof Error ? error.message : 'Inhalte konnten nicht geladen werden.');
    }
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

  const reviewReportStatusLabel = (status) => {
    if (status === 'kept') return 'Bleibt online';
    if (status === 'removed') return 'Entfernt';
    return 'Offen';
  };

  const createReviewReportCard = (report) => {
    const card = document.createElement('article');
    card.className = 'list-item admin-review-report-card';

    const head = document.createElement('div');
    head.className = 'admin-review-report-head';
    const title = document.createElement('strong');
    title.textContent = report.restaurant?.name || 'Unbekanntes Restaurant';
    const badge = document.createElement('span');
    badge.className = 'admin-status-badge';
    badge.textContent = reviewReportStatusLabel(report.status);
    head.appendChild(title);
    head.appendChild(badge);
    card.appendChild(head);

    const meta = document.createElement('span');
    meta.className = 'admin-review-report-meta';
    meta.textContent = `${report.review?.rating || 0} von 5 Sternen · ${report.review?.authorName || 'Gast'} · ${formatDate(report.review?.createdAt)}`;
    card.appendChild(meta);

    const reviewText = document.createElement('div');
    reviewText.className = 'admin-review-report-text';
    reviewText.textContent = report.review?.text || '';
    card.appendChild(reviewText);

    if (Array.isArray(report.review?.images) && report.review.images.length) {
      const images = document.createElement('div');
      images.className = 'admin-review-images';
      report.review.images.forEach((image) => {
        const link = document.createElement('a');
        link.href = image.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        const preview = document.createElement('img');
        preview.src = image.url;
        preview.alt = 'Bild zur Bewertung';
        link.appendChild(preview);
        images.appendChild(link);
      });
      card.appendChild(images);
    }

    const reason = document.createElement('strong');
    reason.textContent = `Meldegrund: ${report.reasonLabel || report.reason || '--'}`;
    card.appendChild(reason);

    if (report.note) {
      const note = document.createElement('span');
      note.textContent = `Hinweis des Restaurants: ${report.note}`;
      card.appendChild(note);
    }

    const reportMeta = document.createElement('span');
    reportMeta.className = 'notice subtle';
    reportMeta.textContent = `Gemeldet am: ${formatDate(report.reportedAt)} · ${report.restaurant?.email || ''}`;
    card.appendChild(reportMeta);

    if (report.resolutionNote) {
      const resolution = document.createElement('span');
      resolution.className = 'notice subtle';
      resolution.textContent = `Admin-Begründung: ${report.resolutionNote}`;
      card.appendChild(resolution);
    }

    const decisionField = document.createElement('textarea');
    decisionField.className = 'admin-note';
    decisionField.placeholder = report.status === 'removed'
      ? 'Optionale Begründung für die Wiederherstellung'
      : 'Begründung (beim Entfernen erforderlich)';

    const actions = document.createElement('div');
    actions.className = 'input-row';

    const submitDecision = async (decision) => {
      const note = (decisionField.value || '').trim();
      if (decision === 'remove' && !note) {
        setReviewReportError('Bitte vor dem Entfernen eine Begründung eingeben.');
        decisionField.focus();
        return;
      }
      if (decision === 'remove' && !window.confirm('Bewertung wirklich öffentlich entfernen?')) return;
      if (decision === 'restore' && !window.confirm('Bewertung wirklich wieder öffentlich anzeigen?')) return;

      setReviewReportError('');
      setReviewReportStatus('Entscheidung wird gespeichert...');
      Array.from(actions.querySelectorAll('button')).forEach((button) => { button.disabled = true; });
      try {
        await request(`/api/admin/review-reports/${encodeURIComponent(report.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ decision, note: note || undefined })
        });
        setReviewReportStatus('Entscheidung gespeichert.');
        await loadReviewReports();
      } catch (error) {
        setReviewReportError(error instanceof Error ? error.message : 'Entscheidung fehlgeschlagen.');
        setReviewReportStatus('Fehler beim Speichern.');
        Array.from(actions.querySelectorAll('button')).forEach((button) => { button.disabled = false; });
      }
    };

    if (report.status === 'pending') {
      const keepButton = document.createElement('button');
      keepButton.className = 'button ghost';
      keepButton.type = 'button';
      keepButton.textContent = 'Kein Verstoß';
      keepButton.addEventListener('click', () => submitDecision('keep'));
      const removeButton = document.createElement('button');
      removeButton.className = 'button danger';
      removeButton.type = 'button';
      removeButton.textContent = 'Bewertung entfernen';
      removeButton.addEventListener('click', () => submitDecision('remove'));
      actions.appendChild(keepButton);
      actions.appendChild(removeButton);
    } else if (report.status === 'removed') {
      const restoreButton = document.createElement('button');
      restoreButton.className = 'button';
      restoreButton.type = 'button';
      restoreButton.textContent = 'Wiederherstellen';
      restoreButton.addEventListener('click', () => submitDecision('restore'));
      actions.appendChild(restoreButton);
    }

    if (actions.children.length) {
      card.appendChild(decisionField);
      card.appendChild(actions);
    }
    return card;
  };

  const loadReviewReports = async () => {
    if (!token) return;
    const selectedStatus = reviewReportStatusFilter?.value || 'pending';
    setReviewReportError('');
    setReviewReportStatus('Lade Bewertungsmeldungen...');
    if (reviewReportList) reviewReportList.innerHTML = '';
    try {
      const reports = await request(`/api/admin/review-reports?status=${encodeURIComponent(selectedStatus)}`);
      if (!reviewReportList) return;
      if (!Array.isArray(reports) || !reports.length) {
        reviewReportList.appendChild(createEmptyState('Keine Bewertungsmeldungen für diesen Status.'));
        setReviewReportStatus('Keine Bewertungsmeldungen gefunden.');
        return;
      }
      reports.forEach((report) => reviewReportList.appendChild(createReviewReportCard(report)));
      setReviewReportStatus(`Gefunden: ${reports.length} ${reports.length === 1 ? 'Meldung' : 'Meldungen'}.`);
    } catch (error) {
      setReviewReportError(error instanceof Error ? error.message : 'Bewertungsmeldungen konnten nicht geladen werden.');
      setReviewReportStatus('Fehler beim Laden.');
    }
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
      if (
        error instanceof Error &&
        (
          error.message.includes('Admin authentication required') ||
          error.message.includes('Invalid admin token') ||
          error.message.includes('Invalid admin authorization header')
        )
      ) {
        token = '';
        localStorage.removeItem(STORAGE.token);
        setAdminAuthState(false);
        setLoginError('Session abgelaufen. Bitte erneut einloggen.');
        setPasswordStatus('');
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
    await Promise.all([loadRequests(), loadReviewReports(), loadHighlights(), loadHighlightCandidates()]);
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
        await Promise.all([loadRequests(), loadReviewReports(), loadHighlights(), loadHighlightCandidates()]);
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

  if (reviewReportRefreshButton) {
    reviewReportRefreshButton.addEventListener('click', () => loadReviewReports());
  }

  if (reviewReportStatusFilter) {
    reviewReportStatusFilter.addEventListener('change', () => loadReviewReports());
  }

  if (highlightCandidateLoad) {
    highlightCandidateLoad.addEventListener('click', () => loadHighlightCandidates());
  }

  if (highlightCandidateSearch) {
    highlightCandidateSearch.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') loadHighlightCandidates();
    });
  }

  if (highlightCandidateType) {
    highlightCandidateType.addEventListener('change', () => loadHighlightCandidates());
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
      setPasswordStatus('');
      if (requestList) requestList.innerHTML = '';
      if (reviewReportList) reviewReportList.innerHTML = '';
      if (highlightList) highlightList.innerHTML = '';
      if (highlightCandidateList) highlightCandidateList.innerHTML = '';
    });
  }

  if (passwordForm) {
    passwordForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!token) {
        setPasswordStatus('Bitte zuerst einloggen.', true);
        return;
      }

      const formData = new FormData(passwordForm);
      const currentPassword = (formData.get('adminCurrentPassword') || '').toString();
      const newPassword = (formData.get('adminNewPassword') || '').toString();
      const newPasswordRepeat = (formData.get('adminNewPasswordRepeat') || '').toString();

      if (!currentPassword || !newPassword || !newPasswordRepeat) {
        setPasswordStatus('Bitte alle Passwortfelder ausfüllen.', true);
        return;
      }
      if (newPassword.length < 6) {
        setPasswordStatus('Das neue Passwort muss mindestens 6 Zeichen haben.', true);
        return;
      }
      if (newPassword !== newPasswordRepeat) {
        setPasswordStatus('Die neuen Passwörter stimmen nicht überein.', true);
        return;
      }

      try {
        await request('/api/admin/password', {
          method: 'PATCH',
          body: JSON.stringify({
            currentPassword,
            newPassword
          })
        });
        passwordForm.reset();
        setPasswordStatus('Passwort erfolgreich geändert.');
      } catch (error) {
        if (
          error instanceof Error &&
          (
            error.message.includes('Admin authentication required') ||
            error.message.includes('Invalid admin token') ||
            error.message.includes('Invalid admin authorization header')
          )
        ) {
          token = '';
          localStorage.removeItem(STORAGE.token);
          setAdminAuthState(false);
          setLoginError('Session abgelaufen. Bitte erneut einloggen.');
          setPasswordStatus('');
          return;
        }
        setPasswordStatus(
          error instanceof Error ? error.message : 'Passwortänderung fehlgeschlagen.',
          true
        );
      }
    });
  }

  bootstrap();
})();
