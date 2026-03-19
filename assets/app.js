(() => {
  const STORAGE_KEYS = {
    offers: 'mittagstisch.offers',
    profile: 'mittagstisch.profile',
    location: 'mittagstisch.location',
    seeded: 'mittagstisch.seeded'
  };

  const fallbackCenters = {
    '88212': { lat: 47.7832, lon: 9.6124, label: 'Ravensburg' }
  };

  const sampleOffers = [
    {
      restaurant: 'Casa Verde',
      title: 'Pasta Verde',
      description: 'Pesto, Kirschtomaten, Parmesan. Frisch gekocht.',
      tags: ['vegetarian'],
      price: 8.9,
      lat: 47.7819,
      lon: 9.6121,
      postalCode: '88212'
    },
    {
      restaurant: 'Bergblick',
      title: 'Pilzrisotto',
      description: 'Cremig, mit Kräutern und Zitronenabrieb.',
      tags: ['vegetarian'],
      price: 9.4,
      lat: 47.7891,
      lon: 9.5964,
      postalCode: '88212'
    },
    {
      restaurant: 'Green Bento',
      title: 'Tofu Teriyaki Bowl',
      description: 'Reis, Gemüse, Sesam, Teriyaki.',
      tags: ['vegan'],
      price: 10.2,
      lat: 47.7763,
      lon: 9.6215,
      postalCode: '88212'
    },
    {
      restaurant: 'Stadtgarten',
      title: 'Gemüse Curry',
      description: 'Mildes Curry mit Basmatireis.',
      tags: ['vegan'],
      price: 9.1,
      lat: 47.7738,
      lon: 9.6033,
      postalCode: '88212'
    },
    {
      restaurant: 'Marktküche',
      title: 'Schnitzel mit Salat',
      description: 'Hausgemachtes Schnitzel, bunter Salat.',
      tags: [],
      price: 11.8,
      lat: 47.7882,
      lon: 9.6158,
      postalCode: '88212'
    }
  ];

  const loadJSON = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  };

  const saveJSON = (key, value) => {
    localStorage.setItem(key, JSON.stringify(value));
  };

  const loadOffers = () => loadJSON(STORAGE_KEYS.offers, []);
  const saveOffers = (offers) => saveJSON(STORAGE_KEYS.offers, offers);

  const loadProfile = () => loadJSON(STORAGE_KEYS.profile, null);
  const saveProfile = (profile) => saveJSON(STORAGE_KEYS.profile, profile);

  const loadLocation = () => loadJSON(STORAGE_KEYS.location, null);
  const saveLocation = (location) => saveJSON(STORAGE_KEYS.location, location);

  const createId = () => {
    if (window.crypto && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return `offer_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  };

  const formatPrice = (value) => {
    const number = Number(value);
    if (Number.isNaN(number)) return '';
    return number.toFixed(2).replace('.', ',') + ' EUR';
  };

  const haversineKm = (a, b) => {
    const toRad = (v) => (v * Math.PI) / 180;
    const r = 6371;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lon - a.lon);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const sinLat = Math.sin(dLat / 2);
    const sinLon = Math.sin(dLon / 2);
    const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
    return 2 * r * Math.asin(Math.sqrt(h));
  };

  const getFallbackCenter = (postalCode) => fallbackCenters[postalCode] || null;

  const getSampleOffers = () => sampleOffers.map((offer) => ({
    ...offer,
    id: createId(),
    createdAt: new Date().toISOString(),
    image: null
  }));

  const seedOffersIfEmpty = () => {
    const alreadySeeded = localStorage.getItem(STORAGE_KEYS.seeded) === '1';
    const offers = loadOffers();
    if (!offers.length && !alreadySeeded) {
      const seededOffers = getSampleOffers();
      saveOffers(seededOffers);
      localStorage.setItem(STORAGE_KEYS.seeded, '1');
      return seededOffers;
    }
    return offers;
  };

  const registerServiceWorker = () => {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js').catch(() => {});
      });
    }
  };

  const setupInstallPrompt = () => {
    const installButton = document.querySelector('[data-install]');
    if (!installButton) return;
    let deferredPrompt = null;

    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      deferredPrompt = event;
      installButton.classList.remove('hidden');
    });

    installButton.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      installButton.classList.add('hidden');
    });
  };

  registerServiceWorker();
  setupInstallPrompt();

  window.Mittagstisch = {
    loadOffers,
    saveOffers,
    loadProfile,
    saveProfile,
    loadLocation,
    saveLocation,
    createId,
    formatPrice,
    haversineKm,
    getFallbackCenter,
    getSampleOffers,
    seedOffersIfEmpty,
    STORAGE_KEYS
  };
})();

