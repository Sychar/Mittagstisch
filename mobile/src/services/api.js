import { Platform } from 'react-native';

const defaultHost = Platform.select({
  android: 'http://10.0.2.2:4000',
  ios: 'http://localhost:4000',
  default: 'http://localhost:4000'
});

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || defaultHost;
const DEVICE_ID_STORAGE_KEY = 'mittagstisch.device_id';

let cachedDeviceId = null;

const createDeviceId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  const randomPart = Math.random().toString(36).slice(2, 11);
  const timePart = Date.now().toString(36);
  return `dev-${timePart}-${randomPart}`;
};

const getOrCreateDeviceId = () => {
  if (cachedDeviceId) {
    return cachedDeviceId;
  }

  if (Platform.OS === 'web' && typeof globalThis.localStorage !== 'undefined') {
    try {
      const existing = globalThis.localStorage.getItem(DEVICE_ID_STORAGE_KEY);
      if (existing) {
        cachedDeviceId = existing;
        return cachedDeviceId;
      }

      const created = createDeviceId();
      globalThis.localStorage.setItem(DEVICE_ID_STORAGE_KEY, created);
      cachedDeviceId = created;
      return cachedDeviceId;
    } catch {
      // Ignore storage access errors and continue with in-memory fallback.
    }
  }

  cachedDeviceId = createDeviceId();
  return cachedDeviceId;
};

const request = async (path, options = {}) => {
  const { headers, ...rest } = options;
  const isFormData =
    typeof FormData !== 'undefined' &&
    rest.body instanceof FormData;
  const hasContentTypeHeader = Object.keys(headers || {}).some(
    (key) => key.toLowerCase() === 'content-type'
  );
  const hasDeviceIdHeader = Object.keys(headers || {}).some(
    (key) => key.toLowerCase() === 'x-device-id'
  );
  const deviceId = getOrCreateDeviceId();

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    headers: {
      ...(isFormData || hasContentTypeHeader ? {} : { 'Content-Type': 'application/json' }),
      ...(deviceId && !hasDeviceIdHeader ? { 'X-Device-Id': deviceId } : {}),
      ...(headers || {})
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
    let message = data?.message || `Request failed (${response.status})`;
    const fieldErrors = data?.details?.fieldErrors;
    if (fieldErrors && typeof fieldErrors === 'object') {
      const details = Object.entries(fieldErrors)
        .filter(([, value]) => Array.isArray(value) && value.length)
        .map(([key, value]) => `${key}: ${value.join(', ')}`)
        .join(' | ');
      if (details) {
        message = `${message} (${details})`;
      }
    }
    throw new Error(message);
  }

  return data;
};

const buildOffersQuery = (postalCode, radiusKm, mealSlot) => {
  const params = new URLSearchParams({
    postalCode: String(postalCode),
    radiusKm: String(radiusKm)
  });

  if (mealSlot) {
    params.set('mealSlot', mealSlot);
  }

  return `/api/offers?${params.toString()}`;
};

const buildDiscoverRestaurantsQuery = (postalCode, radiusKm, mealSlot) => {
  const params = new URLSearchParams({
    postalCode: String(postalCode),
    radiusKm: String(radiusKm)
  });

  if (mealSlot) {
    params.set('mealSlot', mealSlot);
  }

  return `/api/restaurants/discover?${params.toString()}`;
};

export const api = {
  getOffers: (postalCode, radiusKm = 10, mealSlot) =>
    request(buildOffersQuery(postalCode, radiusKm, mealSlot)),
  getOffer: (id, postalCode) =>
    request(`/api/offers/${id}?postalCode=${encodeURIComponent(postalCode)}`),
  createOrder: (payload) =>
    request('/api/orders', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  login: (email, password) =>
    request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    }),
  registerRestaurant: (payload) =>
    request('/api/restaurants/register', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  getRestaurantMe: (token) =>
    request('/api/restaurants/me', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }),
  updateRestaurantProfile: (token, payload) =>
    request('/api/restaurants/me', {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    }),
  getRestaurantOffers: (token) =>
    request('/api/restaurants/offers', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }),
  getRestaurantOrders: (token) =>
    request('/api/restaurants/orders', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }),
  updateRestaurantOrder: (token, id, payload) =>
    request(`/api/restaurants/orders/${id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    }),
  updateRestaurantOffer: (token, id, payload) =>
    request(`/api/restaurants/offers/${id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    }),
  createRestaurantOffer: (token, payload) =>
    request('/api/restaurants/offers', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    }),
  uploadRestaurantMenu: (token, file) => {
    const formData = new FormData();

    if (file?.file) {
      formData.append('file', file.file, file.name || 'menu');
    } else {
      formData.append('file', {
        uri: file.uri,
        name: file.name || 'menu',
        type: file.mimeType || file.type || 'application/octet-stream'
      });
    }

    return request('/api/restaurants/menu', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: formData
    });
  },
  generateRestaurantDigitalMenu: (token, file) => {
    const formData = new FormData();

    if (file?.file) {
      formData.append('file', file.file, file.name || 'menu');
    } else {
      formData.append('file', {
        uri: file.uri,
        name: file.name || 'menu',
        type: file.mimeType || file.type || 'application/octet-stream'
      });
    }

    return request('/api/restaurants/menu/digitalize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: formData
    });
  },
  getRestaurantDigitalMenu: (token) =>
    request('/api/restaurants/menu/digital', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }),
  saveRestaurantDigitalMenu: (token, payload) =>
    request('/api/restaurants/menu/digital', {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    }),
  uploadRestaurantOfferImage: (token, file) => {
    const formData = new FormData();

    if (file?.file) {
      formData.append('file', file.file, file.name || 'offer-image');
    } else {
      formData.append('file', {
        uri: file.uri,
        name: file.name || 'offer-image',
        type: file.mimeType || file.type || 'application/octet-stream'
      });
    }

    return request('/api/restaurants/offers/image', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: formData
    });
  },
  getDiscoverRestaurants: (postalCode, radiusKm = 10, mealSlot) =>
    request(buildDiscoverRestaurantsQuery(postalCode, radiusKm, mealSlot)),
  getPublicRestaurantDigitalMenu: (restaurantId) =>
    request(`/api/restaurants/${encodeURIComponent(restaurantId)}/menu/digital`),
  createTableReservation: (restaurantId, payload) =>
    request(`/api/restaurants/${encodeURIComponent(restaurantId)}/reservations`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  getRestaurantReservations: (token) =>
    request('/api/restaurants/reservations', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }),
  updateRestaurantReservation: (token, id, payload) =>
    request(`/api/restaurants/reservations/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    })
};

export const apiConfig = {
  baseUrl: API_BASE_URL
};
