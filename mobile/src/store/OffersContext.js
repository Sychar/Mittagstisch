import React, { createContext, useContext, useMemo, useState } from 'react';
import { api, apiConfig } from '../services/api';

const OffersContext = createContext(null);

const DEFAULT_MEAL_SLOT = 'lunch';
const VALID_MEAL_SLOTS = ['breakfast', 'lunch', 'dinner'];

const normalizeMealSlot = (value) =>
  VALID_MEAL_SLOTS.includes(value) ? value : DEFAULT_MEAL_SLOT;

const normalizeMealSlots = (value) => {
  if (!Array.isArray(value)) return [DEFAULT_MEAL_SLOT];
  const slots = Array.from(
    new Set(value.filter((item) => VALID_MEAL_SLOTS.includes(item)))
  );
  return slots.length ? slots : [DEFAULT_MEAL_SLOT];
};

const normalizeCuisineTypes = (value) => {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => String(item || '').trim())
        .filter((item) => item.length >= 2)
    )
  );
};

export const formatPrice = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  return `${number.toFixed(2).replace('.', ',')} EUR`;
};

const normalizeRemoteUrl = (value) => {
  if (!value || typeof value !== 'string') return undefined;
  const base = apiConfig?.baseUrl;

  if (value.startsWith('/')) {
    if (!base) return value;
    return `${base.replace(/\/+$/, '')}${value}`;
  }

  try {
    const parsed = new URL(value);
    if ((parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') && base) {
      const baseUrl = new URL(base);
      parsed.protocol = baseUrl.protocol;
      parsed.host = baseUrl.host;
      return parsed.toString();
    }
    return value;
  } catch {
    return value;
  }
};

const mapOffer = (item) => ({
  id: item.id,
  restaurantId: item.restaurant?.id || item.restaurantId || '',
  title: item.title,
  description: item.description,
  price: item.price,
  tags: item.tags || [],
  imageUrl: normalizeRemoteUrl(item.imageUrl),
  imageUri: normalizeRemoteUrl(item.imageUrl),
  mealSlot: normalizeMealSlot(item.mealSlot),
  distanceKm: item.distanceKm,
  active: item.active,
  preorderEnabled: item.preorderEnabled,
  restaurant: item.restaurant?.name || '',
  address: item.restaurant?.address || '',
  phone: item.restaurant?.phone || '',
  postalCode: item.restaurant?.postalCode || '',
  restaurantMealSlots: normalizeMealSlots(item.restaurant?.mealSlots),
  restaurantMenuUrl: normalizeRemoteUrl(item.restaurant?.menuUrl),
  restaurantMenuMimeType: item.restaurant?.menuMimeType || undefined
});

const mapRestaurantOffer = (item, restaurant) => ({
  id: item.id,
  restaurantId: restaurant?.id || item.restaurantId || '',
  title: item.title,
  description: item.description,
  price: item.price,
  tags: item.tags || [],
  imageUrl: normalizeRemoteUrl(item.imageUrl),
  imageUri: normalizeRemoteUrl(item.imageUrl),
  mealSlot: normalizeMealSlot(item.mealSlot),
  active: item.active,
  preorderEnabled: item.preorderEnabled,
  restaurant: restaurant?.name || '',
  address: restaurant?.address || '',
  phone: restaurant?.phone || '',
  postalCode: restaurant?.postalCode || '',
  restaurantMealSlots: normalizeMealSlots(restaurant?.mealSlots),
  restaurantMenuUrl: normalizeRemoteUrl(restaurant?.menuUrl),
  restaurantMenuMimeType: restaurant?.menuMimeType || undefined
});

const mapOrder = (item) => ({
  id: item.id,
  offerId: item.offerId,
  offerTitle: item.offer?.title || '',
  offerPrice: item.offer?.price || null,
  customerName: item.customerName,
  customerEmail: item.customerEmail || '',
  quantity: item.quantity,
  pickupTime: item.pickupTime,
  fulfillmentType: item.fulfillmentType,
  status: item.status,
  createdAt: item.createdAt
});

const mapRestaurant = (item) => {
  if (!item) return null;
  return {
    ...item,
    mealSlots: normalizeMealSlots(item.mealSlots),
    tableReservationEnabled: Boolean(item.tableReservationEnabled),
    cuisineTypes: normalizeCuisineTypes(item.cuisineTypes),
    approvalStatus: item.approvalStatus || 'pending',
    approvalRequestedAt: item.approvalRequestedAt || null,
    approvalReviewedAt: item.approvalReviewedAt || null,
    approvalNote: item.approvalNote || '',
    menuUrl: normalizeRemoteUrl(item.menuUrl),
    menuMimeType: item.menuMimeType || undefined
  };
};

const mapDiscoveredRestaurantItem = (item) => {
  const restaurant = item?.restaurant || {};
  const featuredOffer = item?.featuredOffer || null;
  const fallbackMealSlot = normalizeMealSlot(item?.mealSlot);
  const primaryMealSlot = normalizeMealSlot(featuredOffer?.mealSlot || fallbackMealSlot);
  const activeOfferCount = Number(item?.activeOfferCount || 0);
  const restaurantName = restaurant?.name || 'Restaurant';

  if (featuredOffer) {
    return {
      id: featuredOffer.id,
      offerId: featuredOffer.id,
      isRestaurantOnly: false,
      activeOfferCount,
      restaurantId: restaurant?.id || '',
      title: featuredOffer.title || restaurantName,
      description: featuredOffer.description || '',
      price: featuredOffer.price,
      tags: featuredOffer.tags || [],
      imageUrl: normalizeRemoteUrl(featuredOffer.imageUrl),
      imageUri: normalizeRemoteUrl(featuredOffer.imageUrl),
      mealSlot: primaryMealSlot,
      distanceKm: item?.distanceKm,
      active: true,
      preorderEnabled: Boolean(featuredOffer.preorderEnabled),
      restaurant: restaurantName,
      address: restaurant?.address || '',
      phone: restaurant?.phone || '',
      postalCode: restaurant?.postalCode || '',
      restaurantMealSlots: normalizeMealSlots(restaurant?.mealSlots),
      restaurantMenuUrl: normalizeRemoteUrl(restaurant?.menuUrl),
      restaurantMenuMimeType: restaurant?.menuMimeType || undefined,
      restaurantHasDigitalMenu: Boolean(item?.hasDigitalMenu),
      restaurantTableReservationEnabled: Boolean(item?.tableReservationEnabled),
      restaurantCuisineTypes: normalizeCuisineTypes(item?.cuisineTypes || restaurant?.cuisineTypes),
      restaurantRatingAverage: Number(item?.ratingAverage || 0),
      restaurantRatingCount: Number(item?.ratingCount || 0)
    };
  }

  const pseudoId = restaurant?.id ? `restaurant-${restaurant.id}-${primaryMealSlot}` : `restaurant-${Date.now()}`;
  return {
    id: pseudoId,
    offerId: null,
    isRestaurantOnly: true,
    activeOfferCount,
    restaurantId: restaurant?.id || '',
    title: restaurantName,
    description: '',
    price: null,
    tags: [],
    imageUrl: undefined,
    imageUri: undefined,
    mealSlot: primaryMealSlot,
    distanceKm: item?.distanceKm,
    active: true,
    preorderEnabled: false,
    restaurant: restaurantName,
    address: restaurant?.address || '',
    phone: restaurant?.phone || '',
    postalCode: restaurant?.postalCode || '',
    restaurantMealSlots: normalizeMealSlots(restaurant?.mealSlots),
    restaurantMenuUrl: normalizeRemoteUrl(restaurant?.menuUrl),
    restaurantMenuMimeType: restaurant?.menuMimeType || undefined,
    restaurantHasDigitalMenu: Boolean(item?.hasDigitalMenu),
    restaurantTableReservationEnabled: Boolean(item?.tableReservationEnabled),
    restaurantCuisineTypes: normalizeCuisineTypes(item?.cuisineTypes || restaurant?.cuisineTypes),
    restaurantRatingAverage: Number(item?.ratingAverage || 0),
    restaurantRatingCount: Number(item?.ratingCount || 0)
  };
};

const mapReservation = (item) => ({
  id: item?.id || '',
  restaurantId: item?.restaurantId || '',
  customerName: item?.customerName || '',
  customerEmail: item?.customerEmail || '',
  customerPhone: item?.customerPhone || '',
  partySize: Number(item?.partySize || 1),
  reservationTime: item?.reservationTime || '',
  mealSlot: normalizeMealSlot(item?.mealSlot),
  note: item?.note || '',
  status: item?.status || 'pending',
  createdAt: item?.createdAt || '',
  updatedAt: item?.updatedAt || ''
});

export const OffersProvider = ({ children }) => {
  const [offers, setOffers] = useState([]);
  const [offersLoading, setOffersLoading] = useState(false);
  const [offersError, setOffersError] = useState('');

  const [authToken, setAuthToken] = useState(null);
  const [restaurant, setRestaurant] = useState(null);
  const [restaurantOffers, setRestaurantOffers] = useState([]);
  const [restaurantOrders, setRestaurantOrders] = useState([]);
  const [restaurantReservations, setRestaurantReservations] = useState([]);
  const [restaurantLoading, setRestaurantLoading] = useState(false);
  const [restaurantError, setRestaurantError] = useState('');
  const [orderStatus, setOrderStatus] = useState('');
  const [orderError, setOrderError] = useState('');
  const [reservationStatus, setReservationStatus] = useState('');
  const [reservationError, setReservationError] = useState('');

  const fetchOffers = async (postalCode, radiusKm = 10, mealSlot = DEFAULT_MEAL_SLOT) => {
    setOffersLoading(true);
    setOffersError('');
    try {
      const data = await api.getDiscoverRestaurants(postalCode, radiusKm, mealSlot);
      const rows = Array.isArray(data) ? data : [];
      const mappedRows = rows.map(mapDiscoveredRestaurantItem);
      const uniqueByRestaurantSlot = new Map();

      mappedRows.forEach((item) => {
        const keyBase = item.restaurantId || item.restaurant || item.id;
        const key = `${keyBase}::${item.mealSlot || DEFAULT_MEAL_SLOT}`;
        const existing = uniqueByRestaurantSlot.get(key);

        if (!existing) {
          uniqueByRestaurantSlot.set(key, item);
          return;
        }

        if (item.offerId && !existing.offerId) {
          uniqueByRestaurantSlot.set(key, item);
        }
      });

      setOffers(Array.from(uniqueByRestaurantSlot.values()));
    } catch (error) {
      setOffers([]);
      setOffersError(error?.message || 'Konnte Angebote nicht laden.');
    } finally {
      setOffersLoading(false);
    }
  };

  const loadRestaurantOffers = async (tokenOverride, restaurantOverride) => {
    const token = tokenOverride || authToken;
    const currentRestaurant = restaurantOverride || restaurant;
    if (!token) return;

    try {
      const data = await api.getRestaurantOffers(token);
      setRestaurantOffers(data.map((item) => mapRestaurantOffer(item, currentRestaurant)));
    } catch (error) {
      setRestaurantOffers([]);
      setRestaurantError(error?.message || 'Konnte Restaurant-Angebote nicht laden.');
    }
  };

  const loadRestaurantOrders = async (tokenOverride) => {
    const token = tokenOverride || authToken;
    if (!token) return;

    try {
      const data = await api.getRestaurantOrders(token);
      setRestaurantOrders(data.map(mapOrder));
    } catch (error) {
      setRestaurantOrders([]);
      setRestaurantError(error?.message || 'Konnte Bestellungen nicht laden.');
    }
  };

  const loadRestaurantReservations = async (tokenOverride) => {
    const token = tokenOverride || authToken;
    if (!token) return;

    try {
      const data = await api.getRestaurantReservations(token);
      const list = Array.isArray(data) ? data : [];
      setRestaurantReservations(list.map(mapReservation));
    } catch (error) {
      setRestaurantReservations([]);
      setRestaurantError(error?.message || 'Konnte Reservierungen nicht laden.');
    }
  };

  const login = async (email, password) => {
    setRestaurantLoading(true);
    setRestaurantError('');
    try {
      const data = await api.login(email, password);
      setAuthToken(data.token);
      const me = await api.getRestaurantMe(data.token).catch(() => null);
      const mappedRestaurant = mapRestaurant(me?.restaurant || data.restaurant);
      setRestaurant(mappedRestaurant);
      await loadRestaurantOffers(data.token, mappedRestaurant);
      await loadRestaurantOrders(data.token);
      await loadRestaurantReservations(data.token);
      return true;
    } catch (error) {
      const raw = error?.message || '';
      if (raw.includes('pending admin approval')) {
        setRestaurantError('Dein Konto wartet auf Freischaltung durch den Admin.');
      } else if (raw.includes('rejected by admin')) {
        setRestaurantError('Deine Registrierung wurde leider nicht freigeschaltet.');
      } else {
        setRestaurantError(raw || 'Login fehlgeschlagen.');
      }
      return false;
    } finally {
      setRestaurantLoading(false);
    }
  };

  const registerRestaurant = async (payload) => {
    setRestaurantLoading(true);
    setRestaurantError('');
    try {
      await api.registerRestaurant(payload);
      return true;
    } catch (error) {
      setRestaurantError(error?.message || 'Registrierung fehlgeschlagen.');
      return false;
    } finally {
      setRestaurantLoading(false);
    }
  };

  const updateRestaurantProfile = async (payload) => {
    if (!authToken) {
      setRestaurantError('Bitte zuerst einloggen.');
      return false;
    }

    setRestaurantLoading(true);
    setRestaurantError('');
    try {
      const data = await api.updateRestaurantProfile(authToken, payload);
      const mappedRestaurant = mapRestaurant(data?.restaurant);
      if (mappedRestaurant) {
        setRestaurant(mappedRestaurant);
        await loadRestaurantOffers(authToken, mappedRestaurant);
      }
      return true;
    } catch (error) {
      setRestaurantError(error?.message || 'Restaurant-Profil konnte nicht aktualisiert werden.');
      return false;
    } finally {
      setRestaurantLoading(false);
    }
  };

  const createRestaurantOffer = async (payload) => {
    if (!authToken) {
      setRestaurantError('Bitte zuerst einloggen.');
      return false;
    }

    setRestaurantLoading(true);
    setRestaurantError('');
    try {
      await api.createRestaurantOffer(authToken, payload);
      await loadRestaurantOffers(authToken, restaurant);
      return true;
    } catch (error) {
      setRestaurantError(error?.message || 'Angebot konnte nicht gespeichert werden.');
      return false;
    } finally {
      setRestaurantLoading(false);
    }
  };

  const updateRestaurantOffer = async (offerId, payload) => {
    if (!authToken) {
      setRestaurantError('Bitte zuerst einloggen.');
      return false;
    }

    setRestaurantLoading(true);
    setRestaurantError('');
    try {
      await api.updateRestaurantOffer(authToken, offerId, payload);
      await loadRestaurantOffers(authToken, restaurant);
      return true;
    } catch (error) {
      setRestaurantError(error?.message || 'Angebot konnte nicht aktualisiert werden.');
      return false;
    } finally {
      setRestaurantLoading(false);
    }
  };

  const logout = () => {
    setAuthToken(null);
    setRestaurant(null);
    setRestaurantOffers([]);
    setRestaurantOrders([]);
    setRestaurantReservations([]);
    setRestaurantError('');
    setReservationStatus('');
    setReservationError('');
  };

  const placeOrder = async (payload) => {
    setOrderStatus('');
    setOrderError('');
    try {
      await api.createOrder(payload);
      setOrderStatus('Vorbestellung gesendet.');
      return true;
    } catch (error) {
      const raw = error?.message || '';
      if (raw.includes('Duplicate order detected')) {
        setOrderError('Diese Vorbestellung wurde gerade bereits gesendet.');
      } else if (raw.includes('Too many requests')) {
        setOrderError('Zu viele Anfragen. Bitte in ein paar Minuten erneut versuchen.');
      } else {
        setOrderError(raw || 'Vorbestellung fehlgeschlagen.');
      }
      return false;
    }
  };

  const updateRestaurantOrder = async (orderId, status) => {
    if (!authToken) {
      setRestaurantError('Bitte zuerst einloggen.');
      return false;
    }

    setRestaurantLoading(true);
    setRestaurantError('');
    try {
      await api.updateRestaurantOrder(authToken, orderId, { status });
      await loadRestaurantOrders(authToken);
      return true;
    } catch (error) {
      setRestaurantError(error?.message || 'Bestellung konnte nicht aktualisiert werden.');
      return false;
    } finally {
      setRestaurantLoading(false);
    }
  };

  const updateRestaurantReservation = async (reservationId, status) => {
    if (!authToken) {
      setRestaurantError('Bitte zuerst einloggen.');
      return false;
    }

    setRestaurantLoading(true);
    setRestaurantError('');
    try {
      await api.updateRestaurantReservation(authToken, reservationId, { status });
      await loadRestaurantReservations(authToken);
      return true;
    } catch (error) {
      setRestaurantError(error?.message || 'Reservierung konnte nicht aktualisiert werden.');
      return false;
    } finally {
      setRestaurantLoading(false);
    }
  };

  const uploadRestaurantMenu = async (file) => {
    if (!authToken) {
      setRestaurantError('Bitte zuerst einloggen.');
      return false;
    }
    if (!file?.uri && !file?.file) {
      setRestaurantError('Keine Datei ausgewählt.');
      return false;
    }

    setRestaurantLoading(true);
    setRestaurantError('');
    try {
      const data = await api.uploadRestaurantMenu(authToken, file);
      const mappedRestaurant = mapRestaurant(data?.restaurant) || restaurant;
      if (mappedRestaurant) {
        setRestaurant(mappedRestaurant);
      }
      await loadRestaurantOffers(authToken, mappedRestaurant);
      return true;
    } catch (error) {
      setRestaurantError(error?.message || 'Menü konnte nicht hochgeladen werden.');
      return false;
    } finally {
      setRestaurantLoading(false);
    }
  };

  const generateRestaurantDigitalMenu = async (file) => {
    if (!authToken) {
      throw new Error('Bitte zuerst einloggen.');
    }
    if (!file?.uri && !file?.file) {
      throw new Error('Keine Datei ausgewählt.');
    }
    try {
      const data = await api.generateRestaurantDigitalMenu(authToken, file);
      return data || null;
    } catch (error) {
      const raw = String(error?.message || '');
      const lowered = raw.toLowerCase();
      const message = lowered.includes('insufficient_quota') || lowered.includes('exceeded your current quota')
        ? 'OpenAI-Kontingent aufgebraucht. Bitte Billing/Quota prüfen oder einen anderen API-Key verwenden.'
        : lowered.includes('invalid api key')
        ? 'OpenAI API-Key ist ungültig. Bitte Key in backend/.env prüfen.'
        : lowered.includes('nicht sicher gelesen') || lowered.includes('unreadable')
        ? 'Die Datei war schwer lesbar. Bitte ein schärferes Bild/PDF hochladen oder manuell nachbearbeiten.'
        : raw || 'Digitales Menü konnte nicht erstellt werden.';
      throw new Error(message);
    }
  };

  const getRestaurantDigitalMenu = async () => {
    if (!authToken) {
      throw new Error('Bitte zuerst einloggen.');
    }
    const data = await api.getRestaurantDigitalMenu(authToken);
    return data || { menu: { items: [] }, updatedAt: null };
  };

  const saveRestaurantDigitalMenu = async (payload) => {
    if (!authToken) {
      throw new Error('Bitte zuerst einloggen.');
    }
    const data = await api.saveRestaurantDigitalMenu(authToken, payload);
    return data || { menu: { items: [] }, updatedAt: null, warnings: [] };
  };

  const uploadRestaurantOfferImage = async (file) => {
    if (!authToken) {
      setRestaurantError('Bitte zuerst einloggen.');
      return null;
    }
    if (!file?.uri && !file?.file) {
      setRestaurantError('Keine Bilddatei ausgewählt.');
      return null;
    }

    setRestaurantLoading(true);
    setRestaurantError('');
    try {
      const data = await api.uploadRestaurantOfferImage(authToken, file);
      return data?.imageUrl || null;
    } catch (error) {
      setRestaurantError(error?.message || 'Bild konnte nicht hochgeladen werden.');
      return null;
    } finally {
      setRestaurantLoading(false);
    }
  };

  const getPublicRestaurantDigitalMenu = async (restaurantId) => {
    if (!restaurantId) {
      throw new Error('Restaurant fehlt.');
    }
    const data = await api.getPublicRestaurantDigitalMenu(restaurantId);
    return data || { menu: { items: [] }, updatedAt: null };
  };

  const placeTableReservation = async (payload) => {
    setReservationStatus('');
    setReservationError('');
    try {
      await api.createTableReservation(payload.restaurantId, payload);
      setReservationStatus('Tischreservierung gesendet.');
      return true;
    } catch (error) {
      setReservationError(error?.message || 'Reservierung fehlgeschlagen.');
      return false;
    }
  };

  const value = useMemo(
    () => ({
      offers,
      offersLoading,
      offersError,
      fetchOffers,
      authToken,
      restaurant,
      restaurantOffers,
      restaurantOrders,
      restaurantReservations,
      restaurantLoading,
      restaurantError,
      login,
      registerRestaurant,
      updateRestaurantProfile,
      createRestaurantOffer,
      updateRestaurantOffer,
      updateRestaurantOrder,
      updateRestaurantReservation,
      uploadRestaurantMenu,
      generateRestaurantDigitalMenu,
      getRestaurantDigitalMenu,
      saveRestaurantDigitalMenu,
      uploadRestaurantOfferImage,
      getPublicRestaurantDigitalMenu,
      loadRestaurantOffers,
      loadRestaurantOrders,
      loadRestaurantReservations,
      logout,
      placeOrder,
      placeTableReservation,
      orderStatus,
      orderError,
      reservationStatus,
      reservationError,
      formatPrice
    }),
    [
      offers,
      offersLoading,
      offersError,
      authToken,
      restaurant,
      restaurantOffers,
      restaurantOrders,
      restaurantReservations,
      restaurantLoading,
      restaurantError,
      orderStatus,
      orderError,
      reservationStatus,
      reservationError
    ]
  );

  return <OffersContext.Provider value={value}>{children}</OffersContext.Provider>;
};

export const useOffers = () => {
  const context = useContext(OffersContext);
  if (!context) {
    throw new Error('useOffers must be used inside OffersProvider');
  }
  return context;
};

