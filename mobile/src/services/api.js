import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const localHost = Platform.select({
  android: 'http://10.0.2.2:4000',
  ios: 'http://localhost:4000',
  default: 'http://localhost:4000'
});

const productionHost = 'https://api.nahundfein.com';
const defaultHost = __DEV__ ? localHost : productionHost;
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || defaultHost;
const WEBSITE_SYNC_API_BASE_URL = process.env.EXPO_PUBLIC_WEBSITE_SYNC_API_URL || API_BASE_URL;
const DEVICE_ID_STORAGE_KEY = 'mittagstisch.device_id';
const MENU_REQUEST_TIMEOUT_MS = 8 * 60 * 1000;
const CLIENT_VERSION = String(Constants.expoConfig?.version || Constants.manifest2?.extra?.expoClient?.version || 'unknown');

let cachedDeviceId = null;
let deviceIdPromise = null;

const createDeviceId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  const randomPart = Math.random().toString(36).slice(2, 11);
  const timePart = Date.now().toString(36);
  return `dev-${timePart}-${randomPart}`;
};

const getOrCreateDeviceId = async () => {
  if (cachedDeviceId) {
    return cachedDeviceId;
  }

  if (deviceIdPromise) {
    return deviceIdPromise;
  }

  deviceIdPromise = (async () => {
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
        // Continue with the secure native fallback below.
      }
    }

    try {
      const existing = await SecureStore.getItemAsync(DEVICE_ID_STORAGE_KEY);
      if (existing) {
        cachedDeviceId = existing;
        return cachedDeviceId;
      }

      const created = createDeviceId();
      await SecureStore.setItemAsync(DEVICE_ID_STORAGE_KEY, created);
      cachedDeviceId = created;
      return cachedDeviceId;
    } catch {
      cachedDeviceId = createDeviceId();
      return cachedDeviceId;
    }
  })();

  try {
    return await deviceIdPromise;
  } finally {
    deviceIdPromise = null;
  }
};

const request = async (path, options = {}) => {
  const { headers, timeoutMs, ...rest } = options;
  const isFormData =
    typeof FormData !== 'undefined' &&
    rest.body instanceof FormData;
  const hasRequestBody = typeof rest.body !== 'undefined' && rest.body !== null;
  const hasContentTypeHeader = Object.keys(headers || {}).some(
    (key) => key.toLowerCase() === 'content-type'
  );
  const hasDeviceIdHeader = Object.keys(headers || {}).some(
    (key) => key.toLowerCase() === 'x-device-id'
  );
  const deviceId = await getOrCreateDeviceId();

  const controller = timeoutMs && typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = controller
    ? setTimeout(() => controller.abort(), Math.max(1, Number(timeoutMs)))
    : null;
  let response;
  try {
    response = await fetch(/^https?:\/\//i.test(path) ? path : `${API_BASE_URL}${path}`, {
      ...rest,
      ...(controller ? { signal: controller.signal } : {}),
      headers: {
        ...(isFormData || hasContentTypeHeader || !hasRequestBody ? {} : { 'Content-Type': 'application/json' }),
        ...(deviceId && !hasDeviceIdHeader ? { 'X-Device-Id': deviceId } : {}),
        'X-Client-Platform': Platform.OS,
        'X-Client-Version': CLIENT_VERSION,
        ...(headers || {})
      }
    });
  } catch (error) {
    if (controller?.signal.aborted) {
      const timeoutError = new Error('Die Verarbeitung hat zu lange gedauert. Bitte erneut versuchen.');
      timeoutError.code = 'CLIENT_TIMEOUT';
      throw timeoutError;
    }
    throw error;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }

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
    const error = new Error(message);
    error.status = response.status;
    error.payload = data;
    error.code = data?.error || data?.code || '';
    error.diagnosticId = data?.diagnosticId || data?.details?.diagnosticId || '';
    error.details = data?.details || null;
    throw error;
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

const buildDiscoverRestaurantsQuery = (locationQuery, radiusKm, mealSlot) => {
  const params = new URLSearchParams({
    query: String(locationQuery),
    radiusKm: String(radiusKm)
  });

  if (mealSlot) {
    params.set('mealSlot', mealSlot);
  }

  return `/api/restaurants/discover?${params.toString()}`;
};

const buildDiscoverCateringQuery = (locationQuery, radiusKm) => {
  const params = new URLSearchParams({
    query: String(locationQuery),
    radiusKm: String(radiusKm)
  });
  return `/api/catering/discover?${params.toString()}`;
};

const buildDiscoverEventsQuery = ({ locationQuery, radiusKm = 30, date, tags } = {}) => {
  const params = new URLSearchParams();
  if (locationQuery) params.set('postalCodeOrCity', String(locationQuery));
  if (radiusKm) params.set('radiusKm', String(radiusKm));
  if (date) params.set('date', String(date));
  if (Array.isArray(tags) && tags.length) params.set('tags', tags.join(','));
  return `/api/events/discover?${params.toString()}`;
};

export const api = {
  getHighlights: () => request('/api/highlights'),
  resolveDiscoveryItems: (items) =>
    request('/api/discovery/items/resolve', {
      method: 'POST',
      body: JSON.stringify({ items })
    }),
  getOffers: (postalCode, radiusKm = 10, mealSlot) =>
    request(buildOffersQuery(postalCode, radiusKm, mealSlot)),
  getEvents: (payload) =>
    request(buildDiscoverEventsQuery(payload)),
  getEvent: (id, occurrenceStartAt) => {
    const params = new URLSearchParams();
    if (occurrenceStartAt) params.set('occurrenceStartAt', String(occurrenceStartAt));
    const query = params.toString();
    return request(`/api/events/${encodeURIComponent(id)}${query ? `?${query}` : ''}`);
  },
  getEventFollowedProviders: (providerIds) => {
    const ids = Array.isArray(providerIds) ? providerIds.filter(Boolean) : [];
    if (!ids.length) return Promise.resolve({ providerIds: [] });
    return request(`/api/events/follows?providerIds=${encodeURIComponent(ids.join(','))}`);
  },
  followEventProvider: (providerId, payload) =>
    request(`/api/events/providers/${encodeURIComponent(providerId)}/follow`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  unfollowEventProvider: (providerId) =>
    request(`/api/events/providers/${encodeURIComponent(providerId)}/follow`, {
      method: 'DELETE'
    }),
  getOffer: (id, postalCode) =>
    request(`/api/offers/${id}?postalCode=${encodeURIComponent(postalCode)}`),
  getPublicOffer: (id) =>
    request(`/api/offers/${encodeURIComponent(id)}/public`),
  createOrder: (payload) =>
    request('/api/orders', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  login: (email, password, rememberMe = false) =>
    request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, rememberMe })
    }),
  requestRestaurantPasswordReset: (email) =>
    request('/api/auth/password-reset/request', {
      method: 'POST',
      body: JSON.stringify({ email })
    }),
  confirmRestaurantPasswordReset: ({ email, code, password }) =>
    request('/api/auth/password-reset/confirm', {
      method: 'POST',
      body: JSON.stringify({ email, code, password })
    }),
  changeRestaurantPassword: (token, { currentPassword, newPassword }) =>
    request('/api/auth/password/change', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ currentPassword, newPassword })
    }),
  registerRestaurant: (payload) => {
    const { regularMenuFiles: _regularMenuFiles, lunchMenuFiles: _lunchMenuFiles, ...registration } = payload || {};
    return request('/api/restaurants/register', {
      method: 'POST',
      body: JSON.stringify(registration)
    });
  },
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
  getRestaurantWebsiteSync: (token) =>
    request(`${WEBSITE_SYNC_API_BASE_URL}/api/restaurants/website-sync`, {
      headers: { Authorization: `Bearer ${token}` }
    }),
  startRestaurantWebsiteSync: (token, payload) =>
    request(`${WEBSITE_SYNC_API_BASE_URL}/api/restaurants/website-sync/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload || {})
    }),
  applyRestaurantWebsiteSync: (token, payload) =>
    request(`${WEBSITE_SYNC_API_BASE_URL}/api/restaurants/website-sync/apply`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload)
    }),
  updateRestaurantOnboardingDraft: (token, payload) =>
    request('/api/restaurants/me/onboarding-draft', {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    }),
  completeRestaurantOnboarding: (token) =>
    request('/api/restaurants/me/onboarding-complete', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`
      }
    }),
  sendRestaurantSupportRequest: (token, payload) =>
    request('/api/restaurants/support-request', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    }),
  getRestaurantSupportChat: (token) =>
    request('/api/restaurants/support/chat', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }),
  sendRestaurantSupportChatMessage: (token, message) =>
    request('/api/restaurants/support/chat/messages', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ message })
    }),
  markRestaurantOnboardingHintSeen: (token) =>
    request('/api/restaurants/me/onboarding-hint-seen', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`
      }
    }),
  registerRestaurantPushToken: (token, payload) =>
    request('/api/restaurants/push-token', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    }),
  unregisterRestaurantPushToken: (token, payload) =>
    request('/api/restaurants/push-token', {
      method: 'DELETE',
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
  getRestaurantCateringOffers: (token) =>
    request('/api/restaurants/catering/offers', {
      headers: { Authorization: `Bearer ${token}` }
    }),
  createRestaurantCateringOffer: (token, payload) =>
    request('/api/restaurants/catering/offers', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload)
    }),
  updateRestaurantCateringOffer: (token, id, payload) =>
    request(`/api/restaurants/catering/offers/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload)
    }),
  deleteRestaurantCateringOffer: (token, id) =>
    request(`/api/restaurants/catering/offers/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    }),
  uploadRestaurantCateringImage: (token, file) => {
    const formData = new FormData();
    if (file?.file) {
      formData.append('file', file.file, file.name || 'catering-image');
    } else {
      formData.append('file', {
        uri: file.uri,
        name: file.name || 'catering-image',
        type: file.mimeType || file.type || 'application/octet-stream'
      });
    }
    return request('/api/restaurants/catering/images', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData
    });
  },
  getRestaurantEvents: (token) =>
    request('/api/restaurants/events', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }),
  createRestaurantEvent: (token, payload) =>
    request('/api/restaurants/events', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    }),
  updateRestaurantEvent: (token, id, payload) =>
    request(`/api/restaurants/events/${id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    }),
  deleteRestaurantEvent: (token, id) =>
    request(`/api/restaurants/events/${id}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`
      }
    }),
  cancelRestaurantEventOccurrence: (token, eventId, payload) =>
    request(`/api/restaurants/events/${eventId}/cancellations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    }),
  restoreRestaurantEventOccurrence: (token, eventId, cancellationId) =>
    request(`/api/restaurants/events/${eventId}/cancellations/${cancellationId}`, {
      method: 'DELETE',
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
  deleteRestaurantOrder: (token, id) =>
    request(`/api/restaurants/orders/${id}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`
      }
    }),
  updateRestaurantOffer: (token, id, payload) =>
    request(`/api/restaurants/offers/${id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    }),
  deleteRestaurantOffer: (token, id) =>
    request(`/api/restaurants/offers/${id}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`
      }
    }),
  createRestaurantOffer: (token, payload) =>
    request('/api/restaurants/offers', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    }),
  uploadRestaurantMenu: (token, file, mode = 'replace') => {
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

    const uploadMode = mode === 'append' ? 'append' : 'replace';

    return request(`/api/restaurants/menu?mode=${uploadMode}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: formData,
      timeoutMs: MENU_REQUEST_TIMEOUT_MS
    });
  },
  deleteRestaurantMenu: (token) =>
    request('/api/restaurants/menu', {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`
      }
    }),
  deleteRestaurantMenuCard: (token, kind = 'regular', onboarding = false) =>
    request(
      `/api/restaurants/menu/card?kind=${kind === 'lunch' ? 'lunch' : 'regular'}&onboarding=${onboarding ? 'true' : 'false'}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    ),
  uploadRestaurantOnboardingMenu: (token, files, kind = 'regular') => {
    const formData = new FormData();
    const normalizedFiles = Array.isArray(files) ? files : [files];

    normalizedFiles.filter(Boolean).forEach((file, index) => {
      const fallbackName = `onboarding-menu-${index + 1}`;
      if (file?.file) {
        formData.append('files', file.file, file.name || fallbackName);
        return;
      }
      formData.append('files', {
        uri: file.uri,
        name: file.name || fallbackName,
        type: file.mimeType || file.type || 'application/octet-stream'
      });
    });

    return request(`/api/restaurants/menu/onboarding?kind=${kind === 'lunch' ? 'lunch' : 'regular'}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: formData,
      timeoutMs: MENU_REQUEST_TIMEOUT_MS
    });
  },
  generateRestaurantDigitalMenu: (token, files, kind = 'regular') => {
    const formData = new FormData();
    const normalizedFiles = Array.isArray(files) ? files : [files];

    normalizedFiles.filter(Boolean).forEach((file, index) => {
      const fallbackName = `menu-${index + 1}`;
      if (file?.file) {
        formData.append('files', file.file, file.name || fallbackName);
        return;
      }
      formData.append('files', {
        uri: file.uri,
        name: file.name || fallbackName,
        type: file.mimeType || file.type || 'application/octet-stream'
      });
    });

    return request(`/api/restaurants/menu/digitalize?kind=${kind === 'lunch' ? 'lunch' : 'regular'}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: formData,
      timeoutMs: MENU_REQUEST_TIMEOUT_MS
    });
  },
  getRestaurantDigitalMenu: (token) =>
    request('/api/restaurants/menu/digital', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }),
  getRestaurantLunchMenu: (token) =>
    request('/api/restaurants/menu/lunch', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }),
  getRestaurantOnboardingDigitalMenu: (token) =>
    request('/api/restaurants/menu/onboarding/digital', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }),
  getRestaurantOnboardingLunchMenu: (token) =>
    request('/api/restaurants/menu/onboarding/lunch', {
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
  saveRestaurantLunchMenu: (token, payload) =>
    request('/api/restaurants/menu/lunch', {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    }),
  saveRestaurantOnboardingDigitalMenu: (token, payload) =>
    request('/api/restaurants/menu/onboarding/digital', {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    }),
  saveRestaurantOnboardingLunchMenu: (token, payload) =>
    request('/api/restaurants/menu/onboarding/lunch', {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    }),
  reportRestaurantMenuDiagnostic: (token, payload) =>
    request('/api/restaurants/menu/diagnostics', {
      method: 'POST',
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
  uploadRestaurantEventImage: (token, file) => {
    const formData = new FormData();

    if (file?.file) {
      formData.append('file', file.file, file.name || 'event-image');
    } else {
      formData.append('file', {
        uri: file.uri,
        name: file.name || 'event-image',
        type: file.mimeType || file.type || 'application/octet-stream'
      });
    }

    return request('/api/restaurants/events/image', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: formData
    });
  },
  uploadRestaurantLogo: (token, file) => {
    const formData = new FormData();

    if (file?.file) {
      formData.append('file', file.file, file.name || 'restaurant-logo');
    } else {
      formData.append('file', {
        uri: file.uri,
        name: file.name || 'restaurant-logo',
        type: file.mimeType || file.type || 'application/octet-stream'
      });
    }

    return request('/api/restaurants/logo', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: formData
    });
  },
  getPublicRestaurantReviews: (restaurantId) =>
    request(`/api/restaurants/${encodeURIComponent(restaurantId)}/reviews`),
  createRestaurantReview: (restaurantId, payload) => {
    const formData = new FormData();
    formData.append('rating', String(payload.rating || ''));
    formData.append('text', String(payload.text || ''));
    if (payload.authorName) {
      formData.append('authorName', String(payload.authorName));
    }
    const images = Array.isArray(payload.images) ? payload.images : [];
    images.forEach((file, index) => {
      if (file?.file) {
        formData.append('images', file.file, file.name || `review-${index + 1}`);
        return;
      }
      if (file?.uri) {
        formData.append('images', {
          uri: file.uri,
          name: file.name || `review-${index + 1}`,
          type: file.mimeType || file.type || 'image/jpeg'
        });
      }
    });
    return request(`/api/restaurants/${encodeURIComponent(restaurantId)}/reviews`, {
      method: 'POST',
      body: formData
    });
  },
  getRestaurantReviews: (token) =>
    request('/api/restaurants/reviews', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }),
  replyRestaurantReview: (token, id, payload) =>
    request(`/api/restaurants/reviews/${encodeURIComponent(id)}/reply`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    }),
  markRestaurantReviewRead: (token, id) =>
    request(`/api/restaurants/reviews/${encodeURIComponent(id)}/read`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`
      }
    }),
  reportRestaurantReview: (token, id, payload) =>
    request(`/api/restaurants/reviews/${encodeURIComponent(id)}/report`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    }),
  getDiscoverRestaurants: (locationQuery, radiusKm = 10, mealSlot) =>
    request(buildDiscoverRestaurantsQuery(locationQuery, radiusKm, mealSlot)),
  getDiscoverCatering: (locationQuery, radiusKm = 10) =>
    request(buildDiscoverCateringQuery(locationQuery, radiusKm)),
  getPublicRestaurantDigitalMenu: (restaurantId) =>
    request(`/api/restaurants/${encodeURIComponent(restaurantId)}/menu/digital`),
  getPublicRestaurantLunchMenu: (restaurantId) =>
    request(`/api/restaurants/${encodeURIComponent(restaurantId)}/menu/lunch`),
  trackPublicRestaurantMenuView: (restaurantId, kind) =>
    request(`/api/restaurants/${encodeURIComponent(restaurantId)}/menu/views`, {
      method: 'POST',
      body: JSON.stringify({ kind: kind === 'lunch' ? 'lunch' : 'regular' })
    }),
  trackPublicRestaurantContentView: (restaurantId, payload) =>
    request(`/api/restaurants/${encodeURIComponent(restaurantId)}/content/views`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  getRestaurantMenuAnalytics: (token, range = {}) => {
    const params = new URLSearchParams();
    if (range?.from) params.set('from', range.from);
    if (range?.to) params.set('to', range.to);
    const suffix = params.toString() ? `?${params.toString()}` : '';
    return request(`/api/restaurants/menu/analytics${suffix}`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
  },
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
