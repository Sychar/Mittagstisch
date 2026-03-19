(() => {
  const App = window.Mittagstisch;
  const loginForm = document.querySelector('[data-login-form]');
  const loginPanel = document.querySelector('[data-login-panel]');
  const loginError = document.querySelector('[data-login-error]');
  const demoLoginButton = document.querySelector('[data-demo-login]');
  const restaurantContent = document.querySelector('[data-restaurant-content]');
  const profileForm = document.querySelector('[data-profile-form]');
  const offerForm = document.querySelector('[data-offer-form]');
  const offersList = document.querySelector('[data-offer-list]');
  const locationButton = document.querySelector('[data-location]');
  const locationStatus = document.querySelector('[data-location-status]');
  const imageInput = document.querySelector('[data-image-input]');
  const imagePreview = document.querySelector('[data-image-preview]');
  const offerStatus = document.querySelector('[data-offer-status]');

  let currentImage = null;
  let locationState = App.loadLocation() || { lat: null, lon: null, postalCode: '' };

  const AUTH_KEY = 'mittagstisch.restaurant.auth';
  const DEMO_LOGIN = {
    email: 'demo@mittagstisch.de',
    password: 'mittag123'
  };

  const setLoginError = (message = '') => {
    if (!loginError) return;
    loginError.textContent = message;
    loginError.classList.toggle('hidden', !message);
  };

  const setAuthState = (isAuthed) => {
    if (loginPanel) loginPanel.classList.toggle('hidden', isAuthed);
    if (restaurantContent) restaurantContent.classList.toggle('hidden', !isAuthed);
  };

  const isAuthed = localStorage.getItem(AUTH_KEY) === '1';
  setAuthState(isAuthed);

  if (loginForm) {
    loginForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const formData = new FormData(loginForm);
      const email = (formData.get('loginEmail') || '').toString().trim().toLowerCase();
      const password = (formData.get('loginPassword') || '').toString().trim();

      if (email === DEMO_LOGIN.email && password === DEMO_LOGIN.password) {
        localStorage.setItem(AUTH_KEY, '1');
        setAuthState(true);
        setLoginError('');
      } else {
        setLoginError('Login fehlgeschlagen. Bitte Demo Daten nutzen.');
      }
    });
  }

  if (demoLoginButton && loginForm) {
    demoLoginButton.addEventListener('click', () => {
      const emailInput = loginForm.querySelector('[name="loginEmail"]');
      const passwordInput = loginForm.querySelector('[name="loginPassword"]');
      if (emailInput) emailInput.value = DEMO_LOGIN.email;
      if (passwordInput) passwordInput.value = DEMO_LOGIN.password;
      setLoginError('');
    });
  }

  const setStatus = (message, warn = false) => {
    if (!offerStatus) return;
    offerStatus.textContent = message;
    offerStatus.classList.remove('hidden');
    offerStatus.classList.toggle('warn', warn);
  };

  const updateLocationStatus = () => {
    if (!locationStatus) return;
    if (locationState.lat && locationState.lon) {
      locationStatus.textContent = `Standort gespeichert (${locationState.lat.toFixed(4)}, ${locationState.lon.toFixed(4)}).`;
      locationStatus.classList.remove('warn');
    } else {
      locationStatus.textContent = 'Kein Standort gespeichert.';
      locationStatus.classList.add('warn');
    }
  };

  const geocodePostal = async (postalCode) => {
    if (!postalCode) return null;
    const fallback = App.getFallbackCenter(postalCode);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&country=Germany&postalcode=${encodeURIComponent(postalCode)}&limit=1`;
      const response = await fetch(url, {
        headers: {
          'Accept-Language': 'de'
        }
      });
      if (!response.ok) throw new Error('request failed');
      const data = await response.json();
      if (data && data.length) {
        return {
          lat: parseFloat(data[0].lat),
          lon: parseFloat(data[0].lon),
          label: data[0].display_name || postalCode
        };
      }
    } catch (error) {
      return fallback ? { ...fallback } : null;
    }

    return fallback ? { ...fallback } : null;
  };

  const renderOffers = () => {
    if (!offersList) return;
    const offers = App.loadOffers();
    offersList.innerHTML = '';

    if (!offers.length) {
      const empty = document.createElement('div');
      empty.className = 'notice subtle';
      empty.textContent = 'Noch keine Angebote erstellt.';
      offersList.appendChild(empty);
      return;
    }

    offers.forEach((offer) => {
      const item = document.createElement('div');
      item.className = 'list-item';

      const title = document.createElement('strong');
      title.textContent = `${offer.title} - ${App.formatPrice(offer.price)}`;

      const meta = document.createElement('span');
      meta.textContent = `${offer.restaurant} | PLZ ${offer.postalCode || '--'}`;

      const tags = document.createElement('div');
      tags.className = 'inline-tags';
      if (offer.tags && offer.tags.includes('vegan')) {
        const tag = document.createElement('span');
        tag.className = 'tag';
        tag.textContent = 'vegan';
        tags.appendChild(tag);
      }
      if (offer.tags && offer.tags.includes('vegetarian')) {
        const tag = document.createElement('span');
        tag.className = 'tag gold';
        tag.textContent = 'vegetarisch';
        tags.appendChild(tag);
      }
      if (!tags.children.length) {
        const tag = document.createElement('span');
        tag.className = 'tag alt';
        tag.textContent = 'klassisch';
        tags.appendChild(tag);
      }

      const desc = document.createElement('span');
      desc.textContent = offer.description;

      const remove = document.createElement('button');
      remove.className = 'button ghost';
      remove.textContent = 'Löschen';
      remove.dataset.id = offer.id;

      item.appendChild(title);
      item.appendChild(meta);
      item.appendChild(tags);
      item.appendChild(desc);
      item.appendChild(remove);

      offersList.appendChild(item);
    });
  };

  const syncProfile = () => {
    if (!profileForm) return;
    const profile = App.loadProfile();
    if (!profile) return;
    const name = profileForm.querySelector('[name="restaurantName"]');
    const email = profileForm.querySelector('[name="email"]');
    if (name) name.value = profile.restaurantName || '';
    if (email) email.value = profile.email || '';

    if (!offerForm) return;
    const offerName = offerForm.querySelector('[name="restaurant"]');
    if (offerName && profile.restaurantName) {
      offerName.value = profile.restaurantName;
    }
  };

  if (profileForm) {
    profileForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const formData = new FormData(profileForm);
      const profile = {
        restaurantName: (formData.get('restaurantName') || '').toString().trim(),
        email: (formData.get('email') || '').toString().trim()
      };
      App.saveProfile(profile);
      setStatus('Profil gespeichert.');
      syncProfile();
    });
  }

  if (locationButton) {
    locationButton.addEventListener('click', () => {
      if (!navigator.geolocation) {
        setStatus('Geolocation wird nicht unterstützt.', true);
        return;
      }

      locationButton.disabled = true;
      navigator.geolocation.getCurrentPosition(
        (position) => {
          locationState = {
            lat: position.coords.latitude,
            lon: position.coords.longitude,
            postalCode: locationState.postalCode || ''
          };
          App.saveLocation(locationState);
          updateLocationStatus();
          setStatus('Standort gespeichert.');
          locationButton.disabled = false;
        },
        () => {
          setStatus('Standort konnte nicht gelesen werden.', true);
          locationButton.disabled = false;
        },
        {
          enableHighAccuracy: true,
          timeout: 8000
        }
      );
    });
  }

  if (imageInput) {
    imageInput.addEventListener('change', () => {
      const file = imageInput.files && imageInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        currentImage = reader.result;
        if (imagePreview) {
          imagePreview.src = currentImage;
          imagePreview.classList.remove('hidden');
        }
      };
      reader.readAsDataURL(file);
    });
  }

  if (offerForm) {
    offerForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(offerForm);
      const restaurant = (formData.get('restaurant') || '').toString().trim();
      const title = (formData.get('title') || '').toString().trim();
      const description = (formData.get('description') || '').toString().trim();
      const priceRaw = (formData.get('price') || '').toString().trim();
      const postalCode = (formData.get('postalCode') || '').toString().trim();
      const vegan = formData.get('vegan') === 'on';
      const vegetarian = formData.get('vegetarian') === 'on';

      if (!restaurant || !title || !description || !priceRaw) {
        setStatus('Bitte alle Pflichtfelder ausfüllen.', true);
        return;
      }

      const price = Number(priceRaw);
      if (!Number.isFinite(price) || price <= 0) {
        setStatus('Bitte einen gültigen Preis eingeben.', true);
        return;
      }

      let lat = locationState.lat;
      let lon = locationState.lon;

      if ((!lat || !lon) && /^\d{5}$/.test(postalCode)) {
        const resolved = await geocodePostal(postalCode);
        if (resolved) {
          lat = resolved.lat;
          lon = resolved.lon;
          locationState = { lat, lon, postalCode };
          App.saveLocation(locationState);
        }
      }

      const offer = {
        id: App.createId(),
        restaurant,
        title,
        description,
        price,
        tags: [vegan ? 'vegan' : null, vegetarian ? 'vegetarian' : null].filter(Boolean),
        postalCode,
        lat: typeof lat === 'number' ? lat : null,
        lon: typeof lon === 'number' ? lon : null,
        image: currentImage,
        createdAt: new Date().toISOString()
      };

      const offers = App.loadOffers();
      offers.unshift(offer);
      App.saveOffers(offers);

      setStatus('Angebot gespeichert und online.', false);
      renderOffers();
      offerForm.reset();
      const offerName = offerForm.querySelector('[name="restaurant"]');
      if (offerName) offerName.value = restaurant;
      const postalInput = offerForm.querySelector('[name="postalCode"]');
      if (postalInput && postalCode) postalInput.value = postalCode;
      if (imagePreview) {
        imagePreview.classList.add('hidden');
        imagePreview.src = '';
      }
      currentImage = null;
    });
  }

  if (offersList) {
    offersList.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const id = target.dataset.id;
      if (!id) return;
      const offers = App.loadOffers().filter((offer) => offer.id !== id);
      App.saveOffers(offers);
      renderOffers();
    });
  }

  const init = () => {
    syncProfile();
    updateLocationStatus();
    renderOffers();
  };

  init();
})();

