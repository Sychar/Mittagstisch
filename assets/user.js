(() => {
  const App = window.Mittagstisch;
  const form = document.querySelector('[data-zip-form]');
  const input = document.querySelector('[data-zip-input]');
  const feed = document.querySelector('[data-feed]');
  const banner = document.querySelector('[data-banner]');
  const status = document.querySelector('[data-status]');
  const seedButton = document.querySelector('[data-seed]');
  const veganToggle = document.querySelector('[data-filter="vegan"]');
  const vegetarianToggle = document.querySelector('[data-filter="vegetarian"]');

  const state = {
    location: null,
    zip: ''
  };

  const showBanner = (message, variant = 'warn') => {
    if (!banner) return;
    banner.textContent = message;
    banner.classList.remove('hidden');
    banner.classList.toggle('warn', variant === 'warn');
  };

  const clearBanner = () => {
    if (!banner) return;
    banner.textContent = '';
    banner.classList.add('hidden');
  };

  const updateStatus = (message) => {
    if (!status) return;
    status.textContent = message;
  };

  const formatDistance = (km) => {
    if (km === null || Number.isNaN(km)) return '-- km';
    return `${km.toFixed(1).replace('.', ',')} km`;
  };

  const renderEmpty = (message) => {
    feed.innerHTML = '';
    const empty = document.createElement('div');
    empty.className = 'notice subtle';
    empty.textContent = message;
    feed.appendChild(empty);
  };

  const renderOffers = (offers, location) => {
    feed.innerHTML = '';
    if (!offers.length) {
      renderEmpty('Keine Angebote gefunden. Probiere eine andere Postleitzahl oder erstelle ein Angebot.');
      return;
    }

    offers.forEach((offer, index) => {
      const card = document.createElement('article');
      card.className = 'card';
      card.style.setProperty('--delay', `${index * 0.05}s`);

      const image = document.createElement('div');
      image.className = 'card-image';
      if (offer.image) {
        const img = document.createElement('img');
        img.src = offer.image;
        img.alt = offer.title;
        image.appendChild(img);
      } else {
        const initials = document.createElement('span');
        initials.textContent = offer.title.slice(0, 1).toUpperCase();
        image.appendChild(initials);
      }

      const body = document.createElement('div');
      body.className = 'card-body';

      const title = document.createElement('div');
      title.className = 'card-title';
      const h3 = document.createElement('h3');
      h3.textContent = offer.title;
      const price = document.createElement('span');
      price.textContent = App.formatPrice(offer.price);
      title.appendChild(h3);
      title.appendChild(price);

      const meta = document.createElement('div');
      meta.className = 'card-meta';
      const restaurant = document.createElement('span');
      restaurant.textContent = offer.restaurant;
      const distance = document.createElement('span');
      distance.textContent = location && offer.distance !== null
        ? formatDistance(offer.distance)
        : 'Distanz: --';
      meta.appendChild(restaurant);
      meta.appendChild(distance);

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

      const desc = document.createElement('p');
      desc.textContent = offer.description;

      body.appendChild(title);
      body.appendChild(meta);
      body.appendChild(tags);
      body.appendChild(desc);

      card.appendChild(image);
      card.appendChild(body);
      feed.appendChild(card);
    });
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
      if (fallback) {
        return { ...fallback };
      }
      return null;
    }

    return fallback ? { ...fallback } : null;
  };

  const applyFilters = (offers) => {
    const veganOnly = veganToggle && veganToggle.checked;
    const vegetarianOnly = vegetarianToggle && vegetarianToggle.checked;

    return offers.filter((offer) => {
      const tags = offer.tags || [];
      if (veganOnly && !tags.includes('vegan')) return false;
      if (vegetarianOnly && !tags.includes('vegetarian')) return false;
      return true;
    });
  };

  const runSearch = async () => {
    clearBanner();
    const zip = input.value.trim();
    state.zip = zip;

    if (!/^\d{5}$/.test(zip)) {
      showBanner('Bitte eine 5-stellige Postleitzahl eingeben.');
      return;
    }

    updateStatus('Suche nach Angeboten...');
    const location = await geocodePostal(zip);
    state.location = location;

    const offers = App.loadOffers();
    if (!offers.length) {
      updateStatus('Noch keine Angebote gespeichert.');
      renderEmpty('Noch keine Angebote. Wechsle auf die Restaurant-Seite oder lade Demo-Angebote.');
      return;
    }

    let filtered = offers;
    let offersWithoutLocation = 0;

    if (location) {
      const offersWithLocation = offers.filter((offer) => typeof offer.lat === 'number' && typeof offer.lon === 'number');
      offersWithoutLocation = offers.length - offersWithLocation.length;

      filtered = offersWithLocation
        .map((offer) => ({
          ...offer,
          distance: App.haversineKm(location, { lat: offer.lat, lon: offer.lon })
        }))
        .filter((offer) => offer.distance <= 10)
        .sort((a, b) => a.distance - b.distance);
    } else {
      filtered = offers.map((offer) => ({ ...offer, distance: null }));
      showBanner('Geocoding nicht verfügbar. Zeige alle Angebote im Demo-Modus.');
    }

    filtered = applyFilters(filtered);

    updateStatus(
      location
        ? `Gefunden: ${filtered.length} Angebote für ${zip}.`
        : `Gefunden: ${filtered.length} Angebote (Demo).`
    );
    if (offersWithoutLocation > 0 && location) {
      showBanner(`${offersWithoutLocation} Angebote ohne Standort wurden ausgeblendet.`, 'warn');
    }

    renderOffers(filtered, location);
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    runSearch();
  });

  if (veganToggle) {
    veganToggle.addEventListener('change', () => {
      if (state.zip) runSearch();
    });
  }

  if (vegetarianToggle) {
    vegetarianToggle.addEventListener('change', () => {
      if (state.zip) runSearch();
    });
  }

  if (seedButton) {
    seedButton.addEventListener('click', () => {
      const offers = App.getSampleOffers();
      App.saveOffers(offers);
      localStorage.setItem(App.STORAGE_KEYS.seeded, '1');
      if (!input.value.trim()) {
        input.value = '88212';
      }
      runSearch();
    });
  }

  updateStatus('Postleitzahl eingeben, um Angebote zu sehen.');
})();

