import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { api, apiConfig } from '../services/api';
import { eventTagKeys, normalizeEventTags } from '../events/eventConfig';

const OffersContext = createContext(null);

const DEFAULT_MEAL_SLOT = 'lunch';
const VALID_MEAL_SLOTS = ['breakfast', 'lunch', 'dinner'];
const eventWeekdayKeys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const normalizeMealSlot = (value) =>
  VALID_MEAL_SLOTS.includes(value) ? value : DEFAULT_MEAL_SLOT;

const normalizeMealSlots = (value) => {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(value.filter((item) => VALID_MEAL_SLOTS.includes(item)))
  );
};

const cuisineTypeAliasMap = {
  Italienisch: 'Italienisch (Pizza & Pasta)',
  'Italienisch (Pizza)': 'Italienisch (Pizza & Pasta)',
  'Italienisch (Pizza & Pasta)': 'Italienisch (Pizza & Pasta)',
  Amerikanisch: 'Amerikanisch (Burger & Co)',
  'Amerikanisch (Burger)': 'Amerikanisch (Burger & Co)',
  'Amerikanisch (Burger & Co)': 'Amerikanisch (Burger & Co)'
};

const normalizeCuisineType = (value) => {
  const text = String(value || '').trim();
  if (!text) return '';
  return cuisineTypeAliasMap[text] || text;
};

const normalizeCuisineTypes = (value) => {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => normalizeCuisineType(item))
        .filter((item) => item.length >= 2)
      )
  );
};

const normalizeSocialLinks = (value) => {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const platform = String(entry.platform || '').trim();
      const url = normalizeRemoteUrl(String(entry.url || '').trim());
      if (platform.length < 2 || !url) return null;
      const key = `${platform.toLowerCase()}|${String(url).toLowerCase()}`;
      if (seen.has(key)) return null;
      seen.add(key);
      return { platform, url };
    })
    .filter(Boolean)
    .slice(0, 12);
};

const normalizeProviderScopes = (value) => {
  const source = Array.isArray(value) ? value : [];
  const scopes = source
    .map((entry) => String(entry || '').trim())
    .filter((entry) => entry === 'food' || entry === 'events' || entry === 'catering');
  const unique = Array.from(new Set(scopes));
  return unique.length ? unique : ['food'];
};

const normalizeEventProfile = (value) => {
  const source = value && typeof value === 'object' ? value : {};
  return {
    offeringsText: normalizeAboutText(source.offeringsText),
    reservationUrl: normalizeReservationExternalLink(source.reservationUrl),
    contactUrl: normalizeReservationExternalLink(source.contactUrl),
    contactEmail: normalizeReservationExternalEmail(source.contactEmail),
    contactPhone: normalizeReservationExternalPhone(source.contactPhone)
  };
};

const normalizeCateringProfile = (value) => {
  const source = value && typeof value === 'object' ? value : {};
  return {
    offeringsText: normalizeAboutText(source.offeringsText),
    contactUrl: normalizeReservationExternalLink(source.contactUrl),
    contactEmail: normalizeReservationExternalEmail(source.contactEmail),
    contactPhone: normalizeReservationExternalPhone(source.contactPhone)
  };
};

const mapCateringOffer = (item) => {
  const price = Number(item?.price);
  return {
    id: String(item?.id || '').trim(),
    title: String(item?.title || '').trim(),
    description: String(item?.description || '').trim(),
    price: Number.isFinite(price) && price > 0 ? price : null,
    imageUrls: (Array.isArray(item?.imageUrls) ? item.imageUrls : [])
      .map((value) => normalizeRemoteUrl(value))
      .filter(Boolean)
      .slice(0, 4),
    active: item?.active === undefined ? true : Boolean(item.active),
    sortOrder: Number.isFinite(Number(item?.sortOrder)) ? Number(item.sortOrder) : 0,
    createdAt: String(item?.createdAt || '').trim(),
    updatedAt: String(item?.updatedAt || '').trim()
  };
};

const mapCateringProvider = (item) => ({
  id: String(item?.id || '').trim(),
  name: String(item?.name || '').trim(),
  address: String(item?.address || '').trim(),
  postalCode: String(item?.postalCode || '').trim(),
  phone: String(item?.phone || '').trim(),
  email: String(item?.email || '').trim(),
  lat: normalizeCoordinate(item?.lat),
  lng: normalizeCoordinate(item?.lng),
  distanceKm: Number.isFinite(Number(item?.distanceKm)) ? Number(item.distanceKm) : null,
  logoUrl: normalizeRemoteUrl(item?.logoUrl),
  socialLinks: normalizeSocialLinks(item?.socialLinks),
  cateringProfile: normalizeCateringProfile(item?.cateringProfile),
  cateringOffers: (Array.isArray(item?.cateringOffers) ? item.cateringOffers : [])
    .map(mapCateringOffer)
    .filter((offer) => offer.id && offer.active)
});

const normalizeCoordinate = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const OPENING_DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DEFAULT_OPEN_TIME = '11:00';
const DEFAULT_CLOSE_TIME = '22:00';
const RESTAURANT_SESSION_STORAGE_KEY = 'mittagstisch.restaurant_session';
const EVENT_FAVORITES_STORAGE_KEY = 'mittagstisch.event_favorites';
const RESTAURANT_SESSION_DAYS_SHORT = 14;
const RESTAURANT_SESSION_DAYS_LONG = 180;
const DAY_MS = 24 * 60 * 60 * 1000;

const createDefaultOpeningHours = () =>
  OPENING_DAY_KEYS.reduce((acc, key) => {
    acc[key] = {
      enabled: false,
      openTime: DEFAULT_OPEN_TIME,
      closeTime: DEFAULT_CLOSE_TIME,
      periods: [],
      openEnded: false
    };
    return acc;
  }, {});

const normalizeTimeText = (value, fallback) => {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return fallback;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return fallback;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return fallback;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

const normalizeOpeningHours = (value) => {
  const base = createDefaultOpeningHours();
  if (!value || typeof value !== 'object') return base;
  for (const key of OPENING_DAY_KEYS) {
    const entry = value[key];
    if (!entry || typeof entry !== 'object') continue;
    const enabled = Boolean(entry.enabled);
    const openTime = normalizeTimeText(entry.openTime, DEFAULT_OPEN_TIME);
    const closeTime = normalizeTimeText(entry.closeTime, DEFAULT_CLOSE_TIME);
    const periods = (Array.isArray(entry.periods) ? entry.periods : [])
      .filter((period) => period && typeof period === 'object')
      .map((period) => ({
        openTime: normalizeTimeText(period.openTime, openTime),
        closeTime: normalizeTimeText(period.closeTime, closeTime)
      }))
      .filter(
        (period, index, entries) =>
          period.openTime !== period.closeTime &&
          entries.findIndex(
            (candidate) => candidate.openTime === period.openTime && candidate.closeTime === period.closeTime
          ) === index
      )
      .slice(0, 2);
    const resolvedPeriods = enabled ? (periods.length ? periods : [{ openTime, closeTime }]) : [];
    base[key] = {
      enabled,
      openTime: resolvedPeriods[0]?.openTime || openTime,
      closeTime: resolvedPeriods[0]?.closeTime || closeTime,
      periods: resolvedPeriods,
      openEnded: enabled && Boolean(entry.openEnded)
    };
  }
  return base;
};

const isSessionExpired = (sessionExpiresAt) => {
  const expiresAtMs = Date.parse(String(sessionExpiresAt || ''));
  if (!Number.isFinite(expiresAtMs)) return true;
  return expiresAtMs <= Date.now();
};

const buildFallbackSessionExpiry = (rememberMe) => {
  const days = rememberMe ? RESTAURANT_SESSION_DAYS_LONG : RESTAURANT_SESSION_DAYS_SHORT;
  return new Date(Date.now() + days * DAY_MS).toISOString();
};

const normalizeStoredRestaurantSession = (value) => {
  if (!value || typeof value !== 'object') return null;
  const token = String(value.token || '').trim();
  if (!token) return null;
  const rememberMe = Boolean(value.rememberMe);
  const sessionExpiresAt = String(value.sessionExpiresAt || '').trim() || buildFallbackSessionExpiry(rememberMe);
  return {
    token,
    rememberMe,
    sessionExpiresAt
  };
};

const readStoredRestaurantSession = async () => {
  try {
    if (Platform.OS === 'web') {
      if (typeof globalThis.localStorage === 'undefined') return null;
      const raw = globalThis.localStorage.getItem(RESTAURANT_SESSION_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return normalizeStoredRestaurantSession(parsed);
    }
    const raw = await SecureStore.getItemAsync(RESTAURANT_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return normalizeStoredRestaurantSession(parsed);
  } catch {
    return null;
  }
};

const writeStoredRestaurantSession = async (value) => {
  const normalized = normalizeStoredRestaurantSession(value);
  if (!normalized) return;
  const serialized = JSON.stringify(normalized);
  if (Platform.OS === 'web') {
    if (typeof globalThis.localStorage === 'undefined') return;
    globalThis.localStorage.setItem(RESTAURANT_SESSION_STORAGE_KEY, serialized);
    return;
  }
  await SecureStore.setItemAsync(RESTAURANT_SESSION_STORAGE_KEY, serialized);
};

const clearStoredRestaurantSession = async () => {
  try {
    if (Platform.OS === 'web') {
      if (typeof globalThis.localStorage === 'undefined') return;
      globalThis.localStorage.removeItem(RESTAURANT_SESSION_STORAGE_KEY);
      return;
    }
    await SecureStore.deleteItemAsync(RESTAURANT_SESSION_STORAGE_KEY);
  } catch {
    // Ignore storage access errors.
  }
};

const normalizeStoredEventFavorites = (value) => {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(value.map((entry) => String(entry || '').trim()).filter((entry) => entry.length > 0))
  ).slice(0, 500);
};

const readStoredEventFavorites = async () => {
  try {
    if (Platform.OS === 'web') {
      if (typeof globalThis.localStorage === 'undefined') return [];
      const raw = globalThis.localStorage.getItem(EVENT_FAVORITES_STORAGE_KEY);
      return raw ? normalizeStoredEventFavorites(JSON.parse(raw)) : [];
    }
    const raw = await SecureStore.getItemAsync(EVENT_FAVORITES_STORAGE_KEY);
    return raw ? normalizeStoredEventFavorites(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
};

const writeStoredEventFavorites = async (value) => {
  const normalized = normalizeStoredEventFavorites(value);
  const serialized = JSON.stringify(normalized);
  try {
    if (Platform.OS === 'web') {
      if (typeof globalThis.localStorage === 'undefined') return;
      globalThis.localStorage.setItem(EVENT_FAVORITES_STORAGE_KEY, serialized);
      return;
    }
    await SecureStore.setItemAsync(EVENT_FAVORITES_STORAGE_KEY, serialized);
  } catch {
    // Favorites are a convenience feature; ignore storage failures.
  }
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

const inferMenuFileNameFromUrl = (url, mimeType) => {
  const raw = String(url || '').trim();
  if (!raw) return mimeType === 'application/pdf' ? 'menu.pdf' : 'menu.jpg';
  try {
    const parsed = new URL(raw);
    const name = decodeURIComponent((parsed.pathname || '').split('/').pop() || '').trim();
    if (name) return name;
  } catch {
    const name = decodeURIComponent(raw.split('/').pop() || '').trim();
    if (name) return name;
  }
  return mimeType === 'application/pdf' ? 'menu.pdf' : 'menu.jpg';
};

const normalizeMenuFiles = (value, fallbackUrl, fallbackMimeType, fallbackId = 'legacy') => {
  const source = Array.isArray(value) ? value : [];
  const rows = source
    .map((entry, index) => {
      if (!entry || typeof entry !== 'object') return null;
      const id = String(entry.id || '').trim() || `${fallbackId}-${index + 1}`;
      const url = normalizeRemoteUrl(entry.url);
      const mimeType = String(entry.mimeType || '').trim().toLowerCase();
      const nameRaw = String(entry.name || '').trim();
      const uploadedAt = String(entry.uploadedAt || '').trim();
      if (!url) return null;
      return {
        id,
        name: nameRaw || inferMenuFileNameFromUrl(url, mimeType),
        url,
        mimeType: mimeType || (String(fallbackMimeType || '').toLowerCase() || 'application/octet-stream'),
        uploadedAt: uploadedAt || null
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const aTs = Date.parse(String(a.uploadedAt || ''));
      const bTs = Date.parse(String(b.uploadedAt || ''));
      if (Number.isFinite(aTs) && Number.isFinite(bTs) && aTs !== bTs) return bTs - aTs;
      return String(b.uploadedAt || '').localeCompare(String(a.uploadedAt || ''));
    });

  if (rows.length) return rows;
  const fallbackNormalizedUrl = normalizeRemoteUrl(fallbackUrl);
  if (!fallbackNormalizedUrl) return [];
  const fallbackMime = String(fallbackMimeType || '').toLowerCase();
  return [
    {
      id: `${fallbackId}-fallback`,
      name: inferMenuFileNameFromUrl(fallbackNormalizedUrl, fallbackMime),
      url: fallbackNormalizedUrl,
      mimeType: fallbackMime || 'application/octet-stream',
      uploadedAt: null
    }
  ];
};

const normalizeOfferDescription = (value) => {
  const text = String(value || '').trim();
  if (!text) return '';
  const lowered = text.toLowerCase();
  if (
    lowered === 'aus digitalem menü übernommen.' ||
    lowered === 'aus digitalem menu übernommen.' ||
    lowered === 'keine beschreibung'
  ) {
    return '';
  }
  return text;
};

const normalizeAboutText = (value) => {
  const text = String(value || '').trim();
  return text ? text.slice(0, 2000) : '';
};

const reservationEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const reservationModeValues = ['disabled', 'app', 'external'];
const lunchWeekdayKeys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const isoWeekKeyPattern = /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/;
const RESTAURANT_TIME_ZONE = 'Europe/Berlin';

const normalizeReservationMode = (value, legacyEnabled = false) => {
  const text = String(value || '').trim().toLowerCase();
  if (reservationModeValues.includes(text)) {
    return text;
  }
  return legacyEnabled ? 'app' : 'disabled';
};

const isReservationModeEnabled = (mode) => mode === 'app' || mode === 'external';

const normalizeReservationExternalLink = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(withProtocol);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '';
    }
    return parsed.toString();
  } catch {
    return '';
  }
};

const normalizeReservationExternalEmail = (value) => {
  const text = String(value || '').trim().toLowerCase();
  if (!text || !reservationEmailPattern.test(text)) return '';
  return text.slice(0, 320);
};

const normalizeReservationExternalPhone = (value) => {
  const text = String(value || '').trim();
  if (!text || text.length < 6) return '';
  return text.slice(0, 40);
};

const specialClosureDatePattern = /^\d{4}-\d{2}-\d{2}$/;

const toDatePartsInRestaurantTimeZone = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: RESTAURANT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const year = Number(parts.find((entry) => entry.type === 'year')?.value || '');
  const month = Number(parts.find((entry) => entry.type === 'month')?.value || '');
  const day = Number(parts.find((entry) => entry.type === 'day')?.value || '');
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  return { year, month, day };
};

const toIsoWeekKeyFromDateParts = (year, month, day) => {
  const date = new Date(Date.UTC(year, month - 1, day));
  const dayNumber = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNumber);
  const weekYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(weekYear, 0, 1));
  const weekNumber = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${weekYear}-W${String(weekNumber).padStart(2, '0')}`;
};

const toIsoWeekKeyInRestaurantTimeZone = (value) => {
  const parts = toDatePartsInRestaurantTimeZone(value);
  if (!parts) return '';
  return toIsoWeekKeyFromDateParts(parts.year, parts.month, parts.day);
};

const toLunchWeekdayKeyInRestaurantTimeZone = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: RESTAURANT_TIME_ZONE,
    weekday: 'short'
  }).format(date);

  if (weekday === 'Mon') return 'mon';
  if (weekday === 'Tue') return 'tue';
  if (weekday === 'Wed') return 'wed';
  if (weekday === 'Thu') return 'thu';
  if (weekday === 'Fri') return 'fri';
  if (weekday === 'Sat') return 'sat';
  if (weekday === 'Sun') return 'sun';
  return null;
};

const normalizeSpecialClosures = (value) => {
  if (!Array.isArray(value)) return [];
  const unique = new Map();
  value.forEach((entry) => {
    if (!entry || typeof entry !== 'object') return;
    const date = String(entry.date || '').trim();
    const reason = String(entry.reason || '').trim();
    if (!specialClosureDatePattern.test(date) || reason.length < 2) return;
    if (!unique.has(date)) {
      unique.set(date, {
        date,
        reason: reason.slice(0, 200)
      });
    }
  });
  return Array.from(unique.values()).sort((a, b) => a.date.localeCompare(b.date));
};

const normalizeDigitalMenuState = (value) => {
  const source = value && typeof value === 'object' ? value : {};
  const items = Array.isArray(source.items)
    ? source.items
        .map((entry, index) => {
          if (!entry || typeof entry !== 'object') return null;
          const name = String(entry.name || '').trim();
          const price = Number(entry.price);
          if (!name || !Number.isFinite(price) || price <= 0) return null;
          return {
            id: String(entry.id || '').trim() || `draft-item-${index + 1}`,
            name,
            description: String(entry.description || '').trim(),
            price,
            category: String(entry.category || '').trim() || 'Normal',
            section: String(entry.section || '').trim() || '',
            allergens: Array.isArray(entry.allergens)
              ? entry.allergens.map((allergen) => String(allergen || '').trim()).filter(Boolean)
              : []
          };
        })
        .filter(Boolean)
    : [];

  return {
    items,
    allergens: Array.isArray(source.allergens)
      ? source.allergens.map((entry) => String(entry || '').trim()).filter(Boolean)
      : [],
    updatedAt: String(source.updatedAt || '').trim() || null
  };
};

const normalizeLunchMenuAvailableDates = (value) => {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value
    .map((entry) => String(entry || '').trim())
    .filter((entry) => specialClosureDatePattern.test(entry) && !seen.has(entry) && seen.add(entry))
    .sort((a, b) => a.localeCompare(b));
};

const normalizeLunchMenuWeekdays = (value) => {
  if (!Array.isArray(value)) return [];
  return lunchWeekdayKeys.filter((entry) => value.includes(entry));
};

const normalizeLunchMenuWeekKey = (value) => {
  const text = String(value || '').trim();
  if (!isoWeekKeyPattern.test(text)) return null;
  return text;
};

const normalizeLunchScheduleMode = (value) =>
  value === 'dateRange' || value === 'weekdays' || value === 'openingHours' ? value : null;

const normalizeLunchValidityDate = (value) => {
  const text = String(value || '').trim();
  return specialClosureDatePattern.test(text) ? text : null;
};

const normalizeLunchMenuState = (value) => {
  const source = value && typeof value === 'object' ? value : {};
  const items = Array.isArray(source.items)
    ? source.items
        .map((entry, index) => {
          if (!entry || typeof entry !== 'object') return null;
          const name = String(entry.name || '').trim();
          const price = Number(entry.price);
          if (!name || !Number.isFinite(price) || price <= 0) return null;
          const legacyAvailableDates = normalizeLunchMenuAvailableDates(entry.availableDates);
          let availableWeekdays = normalizeLunchMenuWeekdays(entry.availableWeekdays);
          let repeatWeekly = entry.repeatWeekly === undefined ? true : Boolean(entry.repeatWeekly);
          let activeWeekKey = normalizeLunchMenuWeekKey(entry.activeWeekKey);
          let schedulePending = entry.schedulePending === true;
          let scheduleMode = normalizeLunchScheduleMode(entry.scheduleMode);
          let validFrom = normalizeLunchValidityDate(entry.validFrom);
          let validUntil = normalizeLunchValidityDate(entry.validUntil);

          if (validFrom && validUntil && validUntil < validFrom) validUntil = null;
          if (scheduleMode === 'dateRange' && !validFrom) scheduleMode = 'openingHours';
          if (scheduleMode === 'openingHours') {
            availableWeekdays = [];
            validFrom = null;
            validUntil = null;
            schedulePending = false;
          } else if (scheduleMode === 'dateRange' && !availableWeekdays.length) {
            availableWeekdays = [...lunchWeekdayKeys];
            schedulePending = false;
          } else if (scheduleMode === 'weekdays' && !availableWeekdays.length) {
            availableWeekdays = [...lunchWeekdayKeys];
            schedulePending = false;
          }

          if (!availableWeekdays.length && legacyAvailableDates.length) {
            const firstWeekKey = toIsoWeekKeyInRestaurantTimeZone(legacyAvailableDates[0]);
            const legacyWeekdays = legacyAvailableDates
              .filter((dateText) => toIsoWeekKeyInRestaurantTimeZone(dateText) === firstWeekKey)
              .map((dateText) => toLunchWeekdayKeyInRestaurantTimeZone(dateText))
              .filter(Boolean);
            availableWeekdays = normalizeLunchMenuWeekdays(legacyWeekdays);
            repeatWeekly = false;
            activeWeekKey = firstWeekKey || activeWeekKey;
            schedulePending = false;
          }

          if (scheduleMode === 'openingHours') {
            availableWeekdays = [];
            schedulePending = false;
          } else if (availableWeekdays.length) {
            schedulePending = false;
          } else if (!schedulePending) {
            // Older menus without their own schedule use the restaurant opening days.
            scheduleMode = 'openingHours';
          }

          if (schedulePending) {
            activeWeekKey = null;
          } else if (repeatWeekly) {
            activeWeekKey = null;
          } else if (!activeWeekKey) {
            activeWeekKey = toIsoWeekKeyInRestaurantTimeZone(new Date());
          }

          return {
            id: String(entry.id || '').trim() || `lunch-item-${index + 1}`,
            name,
            description: String(entry.description || '').trim(),
            price,
            category: String(entry.category || '').trim() || 'Normal',
            section: String(entry.section || '').trim() || '',
            allergens: Array.isArray(entry.allergens)
              ? entry.allergens.map((allergen) => String(allergen || '').trim()).filter(Boolean)
              : [],
            availableWeekdays,
            repeatWeekly,
            activeWeekKey,
            schedulePending,
            scheduleMode,
            validFrom,
            validUntil,
            active: entry.active === undefined ? true : Boolean(entry.active)
          };
        })
        .filter(Boolean)
    : [];

  return {
    items,
    allergens: Array.isArray(source.allergens)
      ? source.allergens.map((entry) => String(entry || '').trim()).filter(Boolean)
      : [],
    updatedAt: String(source.updatedAt || '').trim() || null
  };
};

const toLunchMenuTags = (category) => {
  const normalized = String(category || '').trim().toLowerCase();
  if (normalized.includes('vegan')) return ['vegan'];
  if (normalized.includes('vegetar')) return ['vegetarian'];
  return ['classic'];
};

const normalizeOnboardingDraft = (value) => {
  if (!value || typeof value !== 'object') return null;
  return {
    mealSlots: normalizeMealSlots(value.mealSlots),
    cuisineTypes: normalizeCuisineTypes(value.cuisineTypes),
    reservationMode: normalizeReservationMode(value.reservationMode, Boolean(value.tableReservationEnabled)),
    tableReservationEnabled: isReservationModeEnabled(
      normalizeReservationMode(value.reservationMode, Boolean(value.tableReservationEnabled))
    ),
    tableReservationChoiceMade: Boolean(value.tableReservationChoiceMade),
    reservationExternalLink: normalizeReservationExternalLink(value.reservationExternalLink),
    reservationExternalEmail: normalizeReservationExternalEmail(value.reservationExternalEmail),
    reservationExternalPhone: normalizeReservationExternalPhone(value.reservationExternalPhone),
    openingHours: normalizeOpeningHours(value.openingHours),
    aboutText: normalizeAboutText(value.aboutText),
    menuFiles: normalizeMenuFiles(value.menuFiles, undefined, undefined, 'onboarding'),
    digitalMenu: normalizeDigitalMenuState(value.digitalMenu),
    lunchMenuFiles: normalizeMenuFiles(value.lunchMenuFiles, undefined, undefined, 'onboarding-lunch'),
    lunchMenu: normalizeLunchMenuState(value.lunchMenu),
    lastStep: Number.isInteger(Number(value.lastStep)) ? Math.max(0, Math.min(6, Number(value.lastStep))) : 0,
    updatedAt: String(value.updatedAt || '').trim() || null
  };
};

const mapOffer = (item) => ({
  restaurantReservationMode: normalizeReservationMode(
    item.restaurant?.reservationMode,
    Boolean(item.restaurant?.tableReservationEnabled)
  ),
  id: item.id,
  restaurantId: item.restaurant?.id || item.restaurantId || '',
  title: item.title,
  description: normalizeOfferDescription(item.description),
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
  restaurantLat: normalizeCoordinate(item.restaurant?.lat),
  restaurantLng: normalizeCoordinate(item.restaurant?.lng),
  restaurantHasDigitalMenu: Boolean(item.restaurant?.hasDigitalMenu),
  restaurantTableReservationEnabled: isReservationModeEnabled(
    normalizeReservationMode(item.restaurant?.reservationMode, Boolean(item.restaurant?.tableReservationEnabled))
  ),
  restaurantReservationExternalLink: normalizeReservationExternalLink(item.restaurant?.reservationExternalLink),
  restaurantReservationExternalEmail: normalizeReservationExternalEmail(item.restaurant?.reservationExternalEmail),
  restaurantReservationExternalPhone: normalizeReservationExternalPhone(item.restaurant?.reservationExternalPhone),
  restaurantCuisineTypes: normalizeCuisineTypes(item.restaurant?.cuisineTypes),
  restaurantSocialLinks: normalizeSocialLinks(item.restaurant?.socialLinks),
  restaurantMealSlots: normalizeMealSlots(item.restaurant?.mealSlots),
  restaurantAboutText: normalizeAboutText(item.restaurant?.aboutText),
  restaurantSpecialClosures: normalizeSpecialClosures(item.restaurant?.specialClosures),
  restaurantLogoUrl: normalizeRemoteUrl(item.restaurant?.logoUrl),
  restaurantMenuUrl: normalizeRemoteUrl(item.restaurant?.menuUrl),
  restaurantMenuMimeType: item.restaurant?.menuMimeType || undefined,
  restaurantLunchMenuFiles: normalizeMenuFiles(item.restaurant?.lunchMenuFiles, undefined, undefined, item.restaurant?.id || 'lunch')
});

const mapRestaurantOffer = (item, restaurant) => ({
  restaurantReservationMode: normalizeReservationMode(
    restaurant?.reservationMode,
    Boolean(restaurant?.tableReservationEnabled)
  ),
  id: item.id,
  restaurantId: restaurant?.id || item.restaurantId || '',
  title: item.title,
  description: normalizeOfferDescription(item.description),
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
  restaurantLat: normalizeCoordinate(restaurant?.lat),
  restaurantLng: normalizeCoordinate(restaurant?.lng),
  restaurantHasDigitalMenu: Boolean(restaurant?.hasDigitalMenu),
  restaurantTableReservationEnabled: isReservationModeEnabled(
    normalizeReservationMode(restaurant?.reservationMode, Boolean(restaurant?.tableReservationEnabled))
  ),
  restaurantReservationExternalLink: normalizeReservationExternalLink(restaurant?.reservationExternalLink),
  restaurantReservationExternalEmail: normalizeReservationExternalEmail(restaurant?.reservationExternalEmail),
  restaurantReservationExternalPhone: normalizeReservationExternalPhone(restaurant?.reservationExternalPhone),
  restaurantCuisineTypes: normalizeCuisineTypes(restaurant?.cuisineTypes),
  restaurantSocialLinks: normalizeSocialLinks(restaurant?.socialLinks),
  restaurantMealSlots: normalizeMealSlots(restaurant?.mealSlots),
  restaurantAboutText: normalizeAboutText(restaurant?.aboutText),
  restaurantSpecialClosures: normalizeSpecialClosures(restaurant?.specialClosures),
  restaurantLogoUrl: normalizeRemoteUrl(restaurant?.logoUrl),
  restaurantMenuUrl: normalizeRemoteUrl(restaurant?.menuUrl),
  restaurantMenuMimeType: restaurant?.menuMimeType || undefined,
  restaurantLunchMenuFiles: normalizeMenuFiles(restaurant?.lunchMenuFiles, undefined, undefined, restaurant?.id || 'lunch')
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
  const normalizedMenuUrl = normalizeRemoteUrl(item.menuUrl);
  const normalizedMenuMimeType = item.menuMimeType || undefined;
  return {
    ...item,
    mealSlots: normalizeMealSlots(item.mealSlots),
    reservationMode: normalizeReservationMode(item.reservationMode, Boolean(item.tableReservationEnabled)),
    tableReservationEnabled: isReservationModeEnabled(
      normalizeReservationMode(item.reservationMode, Boolean(item.tableReservationEnabled))
    ),
    reservationExternalLink: normalizeReservationExternalLink(item.reservationExternalLink),
    reservationExternalEmail: normalizeReservationExternalEmail(item.reservationExternalEmail),
    reservationExternalPhone: normalizeReservationExternalPhone(item.reservationExternalPhone),
    cuisineTypes: normalizeCuisineTypes(item.cuisineTypes),
    socialLinks: normalizeSocialLinks(item.socialLinks),
    providerScopes: normalizeProviderScopes(item.providerScopes),
    eventProfile: normalizeEventProfile(item.eventProfile),
    eventSetupCompletedAt: String(item.eventSetupCompletedAt || '').trim() || null,
    cateringProfile: normalizeCateringProfile(item.cateringProfile),
    cateringSetupCompletedAt: String(item.cateringSetupCompletedAt || '').trim() || null,
    openingHours: normalizeOpeningHours(item.openingHours),
    specialClosures: normalizeSpecialClosures(item.specialClosures),
    aboutText: normalizeAboutText(item.aboutText),
    websiteSyncUrl: String(item.websiteSyncUrl || '').trim(),
    onboardingHintNeeded: Boolean(item.onboardingHintNeeded),
    onboardingRequired: Boolean(item.onboardingRequired),
    onboardingCompletedAt: String(item.onboardingCompletedAt || '').trim() || null,
    onboardingDraft: normalizeOnboardingDraft(item.onboardingDraft),
    logoUrl: normalizeRemoteUrl(item.logoUrl),
    approvalStatus: item.approvalStatus || 'pending',
    approvalRequestedAt: item.approvalRequestedAt || null,
    approvalReviewedAt: item.approvalReviewedAt || null,
    approvalNote: item.approvalNote || '',
    menuUrl: normalizedMenuUrl,
    menuMimeType: normalizedMenuMimeType,
    menuFiles: normalizeMenuFiles(item.menuFiles, normalizedMenuUrl, normalizedMenuMimeType, item.id || 'restaurant'),
    lunchMenuFiles: normalizeMenuFiles(item.lunchMenuFiles, undefined, undefined, item.id || 'lunch')
  };
};

const buildRestaurantOnlyItem = ({
  restaurant,
  restaurantName,
  fallbackMealSlot,
  primaryMealSlot,
  activeOfferCount,
  restaurantLat,
  restaurantLng,
  resolvedOpeningHours,
  specialClosures,
  hasDigitalMenu,
  distanceKm,
  reservationMode,
  reservationExternalLink,
  reservationExternalEmail,
  reservationExternalPhone,
  tableReservationEnabled,
  cuisineTypes,
  socialLinks,
  ratingAverage,
  ratingCount,
  aboutText,
  hasLunchMenu,
  lunchMenu
}) => ({
  id: restaurant?.id
    ? `restaurant-${restaurant.id}-${primaryMealSlot}`
    : `restaurant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  offerId: null,
  isRestaurantOnly: true,
  activeOfferCount,
  restaurantId: restaurant?.id || '',
  title: restaurantName,
  description: aboutText,
  price: null,
  tags: [],
  imageUrl: undefined,
  imageUri: undefined,
  mealSlot: primaryMealSlot || fallbackMealSlot,
  distanceKm,
  active: true,
  preorderEnabled: false,
  restaurant: restaurantName,
  address: restaurant?.address || '',
  phone: restaurant?.phone || '',
  postalCode: restaurant?.postalCode || '',
  restaurantLat,
  restaurantLng,
  restaurantMealSlots: normalizeMealSlots(restaurant?.mealSlots),
  restaurantOpeningHours: resolvedOpeningHours,
  restaurantSpecialClosures: normalizeSpecialClosures(specialClosures),
  restaurantLogoUrl: normalizeRemoteUrl(restaurant?.logoUrl),
  restaurantMenuUrl: normalizeRemoteUrl(restaurant?.menuUrl),
  restaurantMenuMimeType: restaurant?.menuMimeType || undefined,
  restaurantHasDigitalMenu: hasDigitalMenu,
  restaurantHasLunchMenu: Boolean(hasLunchMenu),
  restaurantLunchMenu: normalizeLunchMenuState(lunchMenu),
  restaurantTableReservationEnabled: isReservationModeEnabled(
    normalizeReservationMode(reservationMode, Boolean(tableReservationEnabled))
  ),
  restaurantReservationMode: normalizeReservationMode(reservationMode, Boolean(tableReservationEnabled)),
  restaurantReservationExternalLink: normalizeReservationExternalLink(reservationExternalLink),
  restaurantReservationExternalEmail: normalizeReservationExternalEmail(reservationExternalEmail),
  restaurantReservationExternalPhone: normalizeReservationExternalPhone(reservationExternalPhone),
  restaurantCuisineTypes: normalizeCuisineTypes(cuisineTypes || restaurant?.cuisineTypes),
  restaurantSocialLinks: normalizeSocialLinks(socialLinks || restaurant?.socialLinks),
  restaurantAboutText: aboutText,
  restaurantRatingAverage: Number(ratingAverage || 0),
  restaurantRatingCount: Number(ratingCount || 0)
});

const mapDiscoveredRestaurantItem = (item) => {
  const restaurant = item?.restaurant || {};
  const featuredOffer = item?.featuredOffer || null;
  const offers = Array.isArray(item?.offers) ? item.offers : [];
  const fallbackMealSlot = normalizeMealSlot(item?.mealSlot);
  const primaryMealSlot = normalizeMealSlot(featuredOffer?.mealSlot || fallbackMealSlot);
  const activeOfferCount = Number(item?.activeOfferCount || offers.length || 0);
  const restaurantName = restaurant?.name || 'Restaurant';
  const restaurantLat = normalizeCoordinate(restaurant?.lat);
  const restaurantLng = normalizeCoordinate(restaurant?.lng);
  const aboutText = normalizeAboutText(item?.aboutText || restaurant?.aboutText);
  const hasDigitalMenu = Boolean(
    item?.hasDigitalMenu || restaurant?.hasDigitalMenu || restaurant?.digitalMenuUpdatedAt
  );
  const hasLunchMenu = Boolean(item?.hasLunchMenu || restaurant?.hasLunchMenu);
  const lunchMenu = normalizeLunchMenuState(item?.lunchMenu || restaurant?.lunchMenu);
  const reservationMode = normalizeReservationMode(
    item?.reservationMode || restaurant?.reservationMode,
    Boolean(item?.tableReservationEnabled ?? restaurant?.tableReservationEnabled)
  );
  const reservationExternalLink = normalizeReservationExternalLink(
    item?.reservationExternalLink || restaurant?.reservationExternalLink
  );
  const reservationExternalEmail = normalizeReservationExternalEmail(
    item?.reservationExternalEmail || restaurant?.reservationExternalEmail
  );
  const reservationExternalPhone = normalizeReservationExternalPhone(
    item?.reservationExternalPhone || restaurant?.reservationExternalPhone
  );
  const resolvedOpeningHours = normalizeOpeningHours(item?.openingHours || restaurant?.openingHours);
  const specialClosures = normalizeSpecialClosures(item?.specialClosures || restaurant?.specialClosures);

  const listedOffers = offers.length ? offers : featuredOffer ? [featuredOffer] : [];
  const lunchMenuRows =
    fallbackMealSlot === 'lunch'
      ? lunchMenu.items.map((entry, index) => ({
          id: entry?.id || `${restaurant?.id || 'restaurant'}-lunch-menu-${index}`,
          offerId: null,
          itemSourceType: 'lunchMenu',
          isRestaurantOnly: false,
          activeOfferCount,
          restaurantId: restaurant?.id || '',
          title: entry?.name || restaurantName,
          description: normalizeOfferDescription(entry?.description),
          price: entry?.price,
          tags: toLunchMenuTags(entry?.category),
          imageUrl: undefined,
          imageUri: undefined,
          mealSlot: 'lunch',
          distanceKm: item?.distanceKm,
          active: entry?.active !== false,
          preorderEnabled: false,
          restaurant: restaurantName,
          address: restaurant?.address || '',
          phone: restaurant?.phone || '',
          postalCode: restaurant?.postalCode || '',
          restaurantLat,
          restaurantLng,
          restaurantMealSlots: normalizeMealSlots(restaurant?.mealSlots),
          restaurantOpeningHours: resolvedOpeningHours,
          restaurantSpecialClosures: specialClosures,
          restaurantLogoUrl: normalizeRemoteUrl(restaurant?.logoUrl),
          restaurantMenuUrl: normalizeRemoteUrl(restaurant?.menuUrl),
          restaurantMenuMimeType: restaurant?.menuMimeType || undefined,
          restaurantHasDigitalMenu: hasDigitalMenu,
          restaurantHasLunchMenu: hasLunchMenu,
          restaurantLunchMenu: lunchMenu,
          restaurantTableReservationEnabled: isReservationModeEnabled(reservationMode),
          restaurantReservationMode: reservationMode,
          restaurantReservationExternalLink: reservationExternalLink,
          restaurantReservationExternalEmail: reservationExternalEmail,
          restaurantReservationExternalPhone: reservationExternalPhone,
          restaurantCuisineTypes: normalizeCuisineTypes(item?.cuisineTypes || restaurant?.cuisineTypes),
          restaurantSocialLinks: normalizeSocialLinks(item?.socialLinks || restaurant?.socialLinks),
          restaurantAboutText: aboutText,
          restaurantRatingAverage: Number(item?.ratingAverage || 0),
          restaurantRatingCount: Number(item?.ratingCount || 0),
          lunchMenuSection: String(entry?.section || '').trim(),
          lunchMenuCategory: String(entry?.category || '').trim() || 'Normal',
          lunchMenuAvailableWeekdays: normalizeLunchMenuWeekdays(entry?.availableWeekdays),
          lunchMenuRepeatWeekly: entry?.repeatWeekly === undefined ? true : Boolean(entry?.repeatWeekly),
          lunchMenuActiveWeekKey: normalizeLunchMenuWeekKey(entry?.activeWeekKey),
          lunchMenuScheduleMode: normalizeLunchScheduleMode(entry?.scheduleMode),
          lunchMenuValidFrom: normalizeLunchValidityDate(entry?.validFrom),
          lunchMenuValidUntil: normalizeLunchValidityDate(entry?.validUntil)
        }))
      : [];

  if (listedOffers.length) {
    const offerRows = listedOffers.map((entry, index) => ({
      id: entry?.id || `${restaurant?.id || 'restaurant'}-${fallbackMealSlot}-${index}`,
      offerId: entry?.id || null,
      isRestaurantOnly: false,
      activeOfferCount,
      restaurantId: restaurant?.id || '',
      title: entry?.title || restaurantName,
      description: normalizeOfferDescription(entry?.description),
      price: entry?.price,
      tags: entry?.tags || [],
      imageUrl: normalizeRemoteUrl(entry?.imageUrl),
      imageUri: normalizeRemoteUrl(entry?.imageUrl),
      mealSlot: normalizeMealSlot(entry?.mealSlot || fallbackMealSlot),
      distanceKm: item?.distanceKm,
      active: true,
      preorderEnabled: Boolean(entry?.preorderEnabled),
      restaurant: restaurantName,
      address: restaurant?.address || '',
      phone: restaurant?.phone || '',
      postalCode: restaurant?.postalCode || '',
      restaurantLat,
      restaurantLng,
      restaurantMealSlots: normalizeMealSlots(restaurant?.mealSlots),
      restaurantOpeningHours: resolvedOpeningHours,
      restaurantSpecialClosures: specialClosures,
      restaurantLogoUrl: normalizeRemoteUrl(restaurant?.logoUrl),
      restaurantMenuUrl: normalizeRemoteUrl(restaurant?.menuUrl),
      restaurantMenuMimeType: restaurant?.menuMimeType || undefined,
      restaurantHasDigitalMenu: hasDigitalMenu,
      restaurantHasLunchMenu: hasLunchMenu,
      restaurantLunchMenu: lunchMenu,
      restaurantTableReservationEnabled: isReservationModeEnabled(reservationMode),
      restaurantReservationMode: reservationMode,
      restaurantReservationExternalLink: reservationExternalLink,
      restaurantReservationExternalEmail: reservationExternalEmail,
      restaurantReservationExternalPhone: reservationExternalPhone,
      restaurantCuisineTypes: normalizeCuisineTypes(item?.cuisineTypes || restaurant?.cuisineTypes),
      restaurantSocialLinks: normalizeSocialLinks(item?.socialLinks || restaurant?.socialLinks),
      restaurantAboutText: aboutText,
      restaurantRatingAverage: Number(item?.ratingAverage || 0),
      restaurantRatingCount: Number(item?.ratingCount || 0)
    }));
    return [
      ...lunchMenuRows,
      ...offerRows,
      buildRestaurantOnlyItem({
        restaurant,
        restaurantName,
        fallbackMealSlot,
        primaryMealSlot,
        activeOfferCount,
        restaurantLat,
        restaurantLng,
        resolvedOpeningHours,
        specialClosures,
        hasDigitalMenu,
        distanceKm: item?.distanceKm,
        reservationMode,
        reservationExternalLink,
        reservationExternalEmail,
        reservationExternalPhone,
        tableReservationEnabled: item?.tableReservationEnabled,
        cuisineTypes: item?.cuisineTypes,
        socialLinks: item?.socialLinks,
        ratingAverage: item?.ratingAverage,
        ratingCount: item?.ratingCount,
        aboutText,
        hasLunchMenu,
        lunchMenu
      })
    ];
  }

  return [
    ...lunchMenuRows,
    buildRestaurantOnlyItem({
      restaurant,
      restaurantName,
      fallbackMealSlot,
      primaryMealSlot,
      activeOfferCount,
      restaurantLat,
      restaurantLng,
      resolvedOpeningHours,
      specialClosures,
      hasDigitalMenu,
      distanceKm: item?.distanceKm,
      reservationMode,
      reservationExternalLink,
      reservationExternalEmail,
      reservationExternalPhone,
      tableReservationEnabled: item?.tableReservationEnabled,
      cuisineTypes: item?.cuisineTypes,
      socialLinks: item?.socialLinks,
      ratingAverage: item?.ratingAverage,
      ratingCount: item?.ratingCount,
      aboutText,
      hasLunchMenu,
      lunchMenu
    })
  ];
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

const mapReview = (item) => ({
  id: item?.id || '',
  restaurantId: item?.restaurantId || '',
  rating: Number(item?.rating || 0),
  text: String(item?.text || ''),
  authorName: String(item?.authorName || 'Gast'),
  images: Array.isArray(item?.images)
    ? item.images
        .map((image) => ({
          id: image?.id || '',
          url: normalizeRemoteUrl(image?.url),
          mimeType: image?.mimeType || '',
          createdAt: image?.createdAt || ''
        }))
        .filter((image) => image.url)
    : [],
  replyText: String(item?.replyText || ''),
  replyCreatedAt: item?.replyCreatedAt || null,
  replyUpdatedAt: item?.replyUpdatedAt || null,
  restaurantSeenAt: item?.restaurantSeenAt || null,
  isUnread: Boolean(item?.isUnread),
  visibilityStatus: item?.visibilityStatus === 'removed' ? 'removed' : 'visible',
  moderatedAt: item?.moderatedAt || null,
  moderationNote: String(item?.moderationNote || ''),
  report: item?.report
    ? {
        id: String(item.report.id || ''),
        reason: String(item.report.reason || ''),
        note: String(item.report.note || ''),
        status: String(item.report.status || 'pending'),
        reportedAt: item.report.reportedAt || null,
        resolvedAt: item.report.resolvedAt || null,
        resolutionNote: String(item.report.resolutionNote || ''),
        restoredAt: item.report.restoredAt || null
      }
    : null,
  createdAt: item?.createdAt || '',
  updatedAt: item?.updatedAt || ''
});

const normalizeEventDate = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const time = Date.parse(raw);
  return Number.isFinite(time) ? new Date(time).toISOString() : '';
};

const normalizeEventWeekdays = (value) => {
  if (!Array.isArray(value)) return [];
  return eventWeekdayKeys.filter((dayKey) => value.includes(dayKey));
};

const mapEvent = (item) => {
  const provider = item?.provider || {};
  const tags = normalizeEventTags(item?.tags);
  const primaryTag = eventTagKeys.includes(String(item?.primaryTag || ''))
    ? String(item.primaryTag)
    : tags[0] || 'other';
  return {
    id: String(item?.id || '').trim(),
    providerId: String(item?.providerId || provider?.id || '').trim(),
    title: String(item?.title || '').trim(),
    description: String(item?.description || '').trim(),
    tags: tags.length ? tags : ['other'],
    primaryTag,
    venueName: String(item?.venueName || '').trim(),
    address: String(item?.address || '').trim(),
    postalCode: String(item?.postalCode || '').trim(),
    lat: normalizeCoordinate(item?.lat),
    lng: normalizeCoordinate(item?.lng),
    startAt: normalizeEventDate(item?.startAt),
    endAt: normalizeEventDate(item?.endAt),
    recurrenceType: item?.recurrenceType === 'weekly' || item?.recurrenceType === 'monthly'
      ? item.recurrenceType
      : 'none',
    recurrenceWeekdays: normalizeEventWeekdays(item?.recurrenceWeekdays),
    recurrenceEndAt: normalizeEventDate(item?.recurrenceEndAt),
    scheduledOccurrences: (Array.isArray(item?.scheduledOccurrences) ? item.scheduledOccurrences : [])
      .map((occurrence) => ({
        id: String(occurrence?.id || '').trim(),
        startAt: normalizeEventDate(occurrence?.startAt),
        endAt: normalizeEventDate(occurrence?.endAt)
      }))
      .filter((occurrence) => occurrence.startAt && occurrence.endAt)
      .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt)),
    socialLinks: normalizeSocialLinks(item?.socialLinks),
    occurrenceStartAt: normalizeEventDate(item?.occurrenceStartAt || item?.startAt),
    occurrenceEndAt: normalizeEventDate(item?.occurrenceEndAt || item?.endAt),
    occurrenceCancelled: Boolean(item?.occurrenceCancelled),
    cancellationId: String(item?.cancellationId || '').trim(),
    cancellationReason: String(item?.cancellationReason || '').trim(),
    upcomingOccurrences: (Array.isArray(item?.upcomingOccurrences) ? item.upcomingOccurrences : [])
      .map((occurrence) => ({
        occurrenceStartAt: normalizeEventDate(occurrence?.occurrenceStartAt),
        occurrenceEndAt: normalizeEventDate(occurrence?.occurrenceEndAt),
        occurrenceCancelled: Boolean(occurrence?.occurrenceCancelled),
        cancellationId: String(occurrence?.cancellationId || '').trim(),
        cancellationReason: String(occurrence?.cancellationReason || '').trim()
      }))
      .filter((occurrence) => occurrence.occurrenceStartAt),
    imageUrl: normalizeRemoteUrl(item?.imageUrl),
    ticketUrl: normalizeReservationExternalLink(item?.ticketUrl),
    contactUrl: normalizeReservationExternalLink(item?.contactUrl),
    contactEmail: normalizeReservationExternalEmail(item?.contactEmail),
    contactPhone: normalizeReservationExternalPhone(item?.contactPhone),
    active: item?.active === undefined ? true : Boolean(item?.active),
    distanceKm: Number.isFinite(Number(item?.distanceKm)) ? Number(item.distanceKm) : null,
    createdAt: normalizeEventDate(item?.createdAt),
    updatedAt: normalizeEventDate(item?.updatedAt),
    provider: {
      id: String(provider?.id || item?.providerId || '').trim(),
      name: String(provider?.name || '').trim(),
      email: String(provider?.email || '').trim(),
      phone: String(provider?.phone || '').trim(),
      address: String(provider?.address || '').trim(),
      postalCode: String(provider?.postalCode || '').trim(),
      logoUrl: normalizeRemoteUrl(provider?.logoUrl),
      socialLinks: normalizeSocialLinks(provider?.socialLinks),
      eventProfile: normalizeEventProfile(provider?.eventProfile)
    }
  };
};

export const OffersProvider = ({ children }) => {
  const [offers, setOffers] = useState([]);
  const [offersLoading, setOffersLoading] = useState(false);
  const [offersError, setOffersError] = useState('');
  const [events, setEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState('');
  const [eventFavoriteIds, setEventFavoriteIds] = useState([]);
  const [cateringProviders, setCateringProviders] = useState([]);
  const [cateringLoading, setCateringLoading] = useState(false);
  const [cateringError, setCateringError] = useState('');

  const [authToken, setAuthToken] = useState(null);
  const [restaurant, setRestaurant] = useState(null);
  const [restaurantOffers, setRestaurantOffers] = useState([]);
  const [restaurantOrders, setRestaurantOrders] = useState([]);
  const [restaurantReservations, setRestaurantReservations] = useState([]);
  const [restaurantReviews, setRestaurantReviews] = useState([]);
  const [restaurantEvents, setRestaurantEvents] = useState([]);
  const [restaurantCateringOffers, setRestaurantCateringOffers] = useState([]);
  const [restaurantLoading, setRestaurantLoading] = useState(false);
  const [restaurantError, setRestaurantError] = useState('');
  const [orderStatus, setOrderStatus] = useState('');
  const [orderError, setOrderError] = useState('');
  const [reservationStatus, setReservationStatus] = useState('');
  const [reservationError, setReservationError] = useState('');
  const [registeredPushToken, setRegisteredPushToken] = useState('');

  const isUnauthorizedError = (error) => {
    const status = Number(error?.status || 0);
    if (status === 401) return true;
    const message = String(error?.message || '').toLowerCase();
    return message.includes('invalid auth token') || message.includes('session expired');
  };

  const getMenuErrorMessage = (error, fallback) => {
    const message = String(error?.message || '').trim() || fallback;
    const diagnosticId = String(error?.diagnosticId || error?.payload?.diagnosticId || '').trim();
    return diagnosticId && !message.includes(diagnosticId)
      ? `${message} (Fehler-ID: ${diagnosticId})`
      : message;
  };

  const clearRestaurantAuthState = useCallback(() => {
    setAuthToken(null);
    setRestaurant(null);
    setRestaurantOffers([]);
    setRestaurantOrders([]);
    setRestaurantReservations([]);
    setRestaurantReviews([]);
    setRestaurantEvents([]);
    setRestaurantCateringOffers([]);
    setRestaurantError('');
    setReservationStatus('');
    setReservationError('');
    setRegisteredPushToken('');
  }, []);

  const clearRestaurantSession = useCallback(async () => {
    await clearStoredRestaurantSession();
    clearRestaurantAuthState();
  }, [clearRestaurantAuthState]);

  const registerRestaurantPushToken = async (token) => {
    if (!token || Platform.OS === 'web') return;

    try {
      let permission = await Notifications.getPermissionsAsync();
      if (permission.status !== 'granted') {
        permission = await Notifications.requestPermissionsAsync();
      }
      if (permission.status !== 'granted') return;

      const projectId =
        Constants?.expoConfig?.extra?.eas?.projectId || Constants?.easConfig?.projectId;
      const pushTokenResult = projectId
        ? await Notifications.getExpoPushTokenAsync({ projectId })
        : await Notifications.getExpoPushTokenAsync();
      const pushToken = String(pushTokenResult?.data || '').trim();
      if (!pushToken) return;

      await api.registerRestaurantPushToken(token, {
        token: pushToken,
        platform: Platform.OS === 'ios' ? 'ios' : 'android'
      });
      setRegisteredPushToken(pushToken);
    } catch (error) {
      console.warn('Push registration failed', error);
    }
  };

  useEffect(() => {
    let active = true;
    readStoredEventFavorites().then((stored) => {
      if (active) {
        setEventFavoriteIds(stored);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const fetchOffers = async (locationQuery, radiusKm = 10, mealSlot = DEFAULT_MEAL_SLOT) => {
    setOffersLoading(true);
    setOffersError('');
    try {
      const data = await api.getDiscoverRestaurants(locationQuery, radiusKm, mealSlot);
      const rows = Array.isArray(data) ? data : [];
      const mappedRows = rows.flatMap(mapDiscoveredRestaurantItem);
      const uniqueById = new Map();

      mappedRows.forEach((item, index) => {
        const key = String(
          item?.id ||
            `${item?.restaurantId || 'restaurant'}::${item?.offerId || item?.title || 'entry'}::${item?.mealSlot || DEFAULT_MEAL_SLOT}::${index}`
        );
        if (!uniqueById.has(key)) {
          uniqueById.set(key, item);
        }
      });

      setOffers(Array.from(uniqueById.values()));
    } catch (error) {
      setOffers([]);
      setOffersError(error?.message || 'Konnte Angebote nicht laden.');
    } finally {
      setOffersLoading(false);
    }
  };

  const fetchEvents = async (payload = {}) => {
    setEventsLoading(true);
    setEventsError('');
    try {
      const data = await api.getEvents(payload);
      const rows = Array.isArray(data) ? data : [];
      const mappedEvents = rows.map(mapEvent).filter((event) => event.id);
      setEvents(mappedEvents);
      const providerIds = Array.from(new Set(mappedEvents.map((event) => event.providerId).filter(Boolean)));
      try {
        const follows = await api.getEventFollowedProviders(providerIds);
        const next = normalizeStoredEventFavorites(follows?.providerIds);
        setEventFavoriteIds(next);
        void writeStoredEventFavorites(next);
      } catch {
        // Event discovery remains available when the optional follow status cannot be refreshed.
      }
    } catch (error) {
      setEvents([]);
      setEventsError(error?.message || 'Events konnten nicht geladen werden.');
    } finally {
      setEventsLoading(false);
    }
  };

  const fetchCatering = async (locationQuery, radiusKm = 10) => {
    setCateringLoading(true);
    setCateringError('');
    try {
      const data = await api.getDiscoverCatering(locationQuery, radiusKm);
      setCateringProviders((Array.isArray(data) ? data : []).map(mapCateringProvider).filter((item) => item.id));
    } catch (error) {
      setCateringProviders([]);
      setCateringError(error?.message || 'Catering-Anbieter konnten nicht geladen werden.');
    } finally {
      setCateringLoading(false);
    }
  };

  const getPublicEvent = async (eventId, occurrenceStartAt) => {
    const id = String(eventId || '').trim();
    if (!id) throw new Error('Event fehlt.');
    return mapEvent(await api.getEvent(id, occurrenceStartAt));
  };

  const getPublicOffer = async (offerId) => {
    const id = String(offerId || '').trim();
    if (!id) throw new Error('Angebot fehlt.');
    return mapOffer(await api.getPublicOffer(id));
  };

  const followEventProvider = useCallback(async (event) => {
    const providerId = String(event?.providerId || event?.provider?.id || '').trim();
    if (!providerId) return { ok: false, message: 'Veranstalter konnte nicht erkannt werden.' };
    if (Platform.OS === 'web') return { ok: false, message: 'Benachrichtigungen sind in der App verfügbar.' };

    try {
      let permission = await Notifications.getPermissionsAsync();
      if (permission.status !== 'granted') {
        permission = await Notifications.requestPermissionsAsync();
      }
      if (permission.status !== 'granted') return { ok: false, permissionDenied: true };

      const projectId = Constants?.expoConfig?.extra?.eas?.projectId || Constants?.easConfig?.projectId;
      const pushTokenResult = projectId
        ? await Notifications.getExpoPushTokenAsync({ projectId })
        : await Notifications.getExpoPushTokenAsync();
      const pushToken = String(pushTokenResult?.data || '').trim();
      if (!pushToken) return { ok: false, message: 'Benachrichtigungen konnten nicht eingerichtet werden.' };

      await api.followEventProvider(providerId, {
        token: pushToken,
        platform: Platform.OS === 'ios' ? 'ios' : 'android'
      });
      setEventFavoriteIds((previous) => {
        const next = normalizeStoredEventFavorites([providerId, ...previous]);
        void writeStoredEventFavorites(next);
        return next;
      });
      return { ok: true };
    } catch (error) {
      return { ok: false, message: error?.message || 'Benachrichtigungen konnten nicht eingerichtet werden.' };
    }
  }, []);

  const unfollowEventProvider = useCallback(async (event) => {
    const providerId = String(event?.providerId || event?.provider?.id || '').trim();
    if (!providerId) return { ok: false, message: 'Veranstalter konnte nicht erkannt werden.' };
    try {
      await api.unfollowEventProvider(providerId);
      setEventFavoriteIds((previous) => {
        const next = previous.filter((entry) => entry !== providerId);
        void writeStoredEventFavorites(next);
        return next;
      });
      return { ok: true };
    } catch (error) {
      return { ok: false, message: error?.message || 'Benachrichtigungen konnten nicht geändert werden.' };
    }
  }, []);

  const loadRestaurantEvents = async (tokenOverride) => {
    const token = tokenOverride || authToken;
    if (!token) return;

    try {
      const data = await api.getRestaurantEvents(token);
      const list = Array.isArray(data) ? data : [];
      setRestaurantEvents(list.map(mapEvent).filter((event) => event.id));
    } catch (error) {
      if (isUnauthorizedError(error)) {
        await clearRestaurantSession();
        return;
      }
      setRestaurantEvents([]);
      setRestaurantError(error?.message || 'Konnte Events nicht laden.');
    }
  };

  const loadRestaurantCateringOffers = async (tokenOverride) => {
    const token = tokenOverride || authToken;
    if (!token) return;
    try {
      const data = await api.getRestaurantCateringOffers(token);
      setRestaurantCateringOffers((Array.isArray(data) ? data : []).map(mapCateringOffer).filter((offer) => offer.id));
    } catch (error) {
      if (isUnauthorizedError(error)) {
        await clearRestaurantSession();
        return;
      }
      setRestaurantCateringOffers([]);
      setRestaurantError(error?.message || 'Catering-Angebote konnten nicht geladen werden.');
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
      if (isUnauthorizedError(error)) {
        await clearRestaurantSession();
        return;
      }
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
      if (isUnauthorizedError(error)) {
        await clearRestaurantSession();
        return;
      }
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
      if (isUnauthorizedError(error)) {
        await clearRestaurantSession();
        return;
      }
      setRestaurantReservations([]);
      setRestaurantError(error?.message || 'Konnte Reservierungen nicht laden.');
    }
  };

  const loadRestaurantReviews = async (tokenOverride) => {
    const token = tokenOverride || authToken;
    if (!token) return;

    try {
      const data = await api.getRestaurantReviews(token);
      const list = Array.isArray(data) ? data : [];
      setRestaurantReviews(list.map(mapReview));
    } catch (error) {
      if (isUnauthorizedError(error)) {
        await clearRestaurantSession();
        return;
      }
      setRestaurantReviews([]);
      setRestaurantError(error?.message || 'Konnte Bewertungen nicht laden.');
    }
  };

  useEffect(() => {
    let active = true;

    const hydrateRestaurantSession = async () => {
      const stored = await readStoredRestaurantSession();
      if (!active || !stored) return;

      if (isSessionExpired(stored.sessionExpiresAt)) {
        await clearStoredRestaurantSession();
        return;
      }

      setRestaurantLoading(true);
      setRestaurantError('');
      try {
        setAuthToken(stored.token);
        const me = await api.getRestaurantMe(stored.token);
        if (!active) return;
        const mappedRestaurant = mapRestaurant(me?.restaurant);
        if (!mappedRestaurant) {
          throw new Error('Ungültige Session.');
        }
        setRestaurant(mappedRestaurant);
        await loadRestaurantOffers(stored.token, mappedRestaurant);
        await loadRestaurantOrders(stored.token);
        await loadRestaurantReservations(stored.token);
        await loadRestaurantReviews(stored.token);
        await loadRestaurantEvents(stored.token);
        await loadRestaurantCateringOffers(stored.token);
        await registerRestaurantPushToken(stored.token);
      } catch {
        if (!active) return;
        await clearRestaurantSession();
      } finally {
        if (active) {
          setRestaurantLoading(false);
        }
      }
    };

    void hydrateRestaurantSession();
    return () => {
      active = false;
    };
  }, []);

  const login = async (email, password, rememberMe = false) => {
    setRestaurantLoading(true);
    setRestaurantError('');
    try {
      const data = await api.login(email, password, rememberMe);
      const sessionExpiresAt =
        String(data?.sessionExpiresAt || '').trim() || buildFallbackSessionExpiry(rememberMe);
      setAuthToken(data.token);
      const me = await api.getRestaurantMe(data.token).catch(() => null);
      const mappedRestaurant = mapRestaurant(me?.restaurant || data.restaurant);
      setRestaurant(mappedRestaurant);
      await loadRestaurantOffers(data.token, mappedRestaurant);
      await loadRestaurantOrders(data.token);
      await loadRestaurantReservations(data.token);
      await loadRestaurantReviews(data.token);
      await loadRestaurantEvents(data.token);
      await loadRestaurantCateringOffers(data.token);
      await registerRestaurantPushToken(data.token);
      await writeStoredRestaurantSession({
        token: data.token,
        rememberMe,
        sessionExpiresAt
      });
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

  const requestRestaurantPasswordReset = async (email) => {
    setRestaurantLoading(true);
    setRestaurantError('');
    try {
      await api.requestRestaurantPasswordReset(email);
      return true;
    } catch (error) {
      setRestaurantError(error?.message || 'Reset-Code konnte nicht gesendet werden.');
      return false;
    } finally {
      setRestaurantLoading(false);
    }
  };

  const confirmRestaurantPasswordReset = async (payload) => {
    setRestaurantLoading(true);
    setRestaurantError('');
    try {
      await api.confirmRestaurantPasswordReset(payload);
      return true;
    } catch (error) {
      setRestaurantError(error?.message || 'Passwort konnte nicht geändert werden.');
      return false;
    } finally {
      setRestaurantLoading(false);
    }
  };

  const changeRestaurantPassword = async (payload) => {
    if (!authToken) {
      setRestaurantError('Bitte zuerst einloggen.');
      return false;
    }

    setRestaurantLoading(true);
    setRestaurantError('');
    try {
      await api.changeRestaurantPassword(authToken, payload);
      return true;
    } catch (error) {
      if (isUnauthorizedError(error)) {
        await clearRestaurantSession();
        return false;
      }
      if (error?.payload?.error === 'INVALID_CURRENT_PASSWORD') {
        setRestaurantError('Das aktuelle Passwort ist nicht korrekt.');
      } else if (error?.payload?.error === 'PASSWORD_UNCHANGED') {
        setRestaurantError('Das neue Passwort muss sich vom aktuellen unterscheiden.');
      } else {
        setRestaurantError(error?.message || 'Passwort konnte nicht geändert werden.');
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
      if (isUnauthorizedError(error)) {
        await clearRestaurantSession();
        return false;
      }
      if (error?.payload?.error === 'EMAIL_EXISTS') {
        setRestaurantError('Diese E-Mail-Adresse ist bereits registriert.');
      } else if (error?.payload?.error === 'POSTAL_CODE_UNKNOWN') {
        setRestaurantError('Adresse oder Postleitzahl konnte nicht gefunden werden.');
      } else {
        setRestaurantError(error?.message || 'Restaurant-Profil konnte nicht aktualisiert werden.');
      }
      return false;
    } finally {
      setRestaurantLoading(false);
    }
  };

  const getRestaurantWebsiteSync = async () => {
    if (!authToken) return null;
    try {
      const data = await api.getRestaurantWebsiteSync(authToken);
      return data?.id ? data : data?.draft || null;
    } catch (error) {
      if (isUnauthorizedError(error)) await clearRestaurantSession();
      setRestaurantError(error?.message || 'Website-Synchronisierung konnte nicht geladen werden.');
      return null;
    }
  };

  const startRestaurantWebsiteSync = async (payload) => {
    if (!authToken) return null;
    setRestaurantError('');
    try {
      const data = await api.startRestaurantWebsiteSync(authToken, payload);
      const draft = data?.id ? data : data?.draft || null;
      if (payload?.websiteUrl) {
        setRestaurant((current) => current ? { ...current, websiteSyncUrl: String(payload.websiteUrl).trim() } : current);
      }
      return draft;
    } catch (error) {
      if (isUnauthorizedError(error)) await clearRestaurantSession();
      setRestaurantError(error?.message || 'Website konnte nicht synchronisiert werden.');
      return null;
    }
  };

  const applyRestaurantWebsiteSync = async (payload) => {
    if (!authToken) return null;
    setRestaurantError('');
    try {
      const data = await api.applyRestaurantWebsiteSync(authToken, payload);
      return data?.id ? data : data?.draft || null;
    } catch (error) {
      if (isUnauthorizedError(error)) await clearRestaurantSession();
      setRestaurantError(error?.message || 'Bereich konnte nicht übernommen werden.');
      return null;
    }
  };

  const updateRestaurantOnboardingDraft = async (payload) => {
    if (!authToken) {
      setRestaurantError('Bitte zuerst einloggen.');
      return null;
    }

    setRestaurantLoading(true);
    setRestaurantError('');
    try {
      const data = await api.updateRestaurantOnboardingDraft(authToken, payload);
      const mappedRestaurant = mapRestaurant(data?.restaurant);
      if (mappedRestaurant) {
        setRestaurant(mappedRestaurant);
      }
      return mappedRestaurant?.onboardingDraft || normalizeOnboardingDraft(data?.onboardingDraft);
    } catch (error) {
      if (isUnauthorizedError(error)) {
        await clearRestaurantSession();
        return null;
      }
      setRestaurantError(error?.message || 'Einrichtungsdaten konnten nicht gespeichert werden.');
      return null;
    } finally {
      setRestaurantLoading(false);
    }
  };

  const markRestaurantOnboardingHintSeen = async () => {
    if (!authToken) {
      setRestaurantError('Bitte zuerst einloggen.');
      return false;
    }

    try {
      await api.markRestaurantOnboardingHintSeen(authToken);
      setRestaurant((prev) =>
        prev
          ? {
              ...prev,
              onboardingHintNeeded: false
            }
          : prev
      );
      return true;
    } catch (error) {
      if (isUnauthorizedError(error)) {
        await clearRestaurantSession();
        return false;
      }
      return false;
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
      if (isUnauthorizedError(error)) {
        await clearRestaurantSession();
        return false;
      }
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
      if (isUnauthorizedError(error)) {
        await clearRestaurantSession();
        return false;
      }
      setRestaurantError(error?.message || 'Angebot konnte nicht aktualisiert werden.');
      return false;
    } finally {
      setRestaurantLoading(false);
    }
  };

  const removeRestaurantOffer = async (offerId) => {
    if (!authToken) {
      setRestaurantError('Bitte zuerst einloggen.');
      return false;
    }

    setRestaurantLoading(true);
    setRestaurantError('');
    try {
      await api.deleteRestaurantOffer(authToken, offerId);
      await loadRestaurantOffers(authToken, restaurant);
      return true;
    } catch (error) {
      if (isUnauthorizedError(error)) {
        await clearRestaurantSession();
        return false;
      }
      setRestaurantError(error?.message || 'Angebot konnte nicht gelöscht werden.');
      return false;
    } finally {
      setRestaurantLoading(false);
    }
  };

  const createRestaurantCateringOffer = async (payload) => {
    if (!authToken) {
      setRestaurantError('Bitte zuerst einloggen.');
      return false;
    }
    setRestaurantLoading(true);
    setRestaurantError('');
    try {
      await api.createRestaurantCateringOffer(authToken, payload);
      await loadRestaurantCateringOffers(authToken);
      return true;
    } catch (error) {
      if (isUnauthorizedError(error)) {
        await clearRestaurantSession();
        return false;
      }
      setRestaurantError(error?.message || 'Catering-Angebot konnte nicht gespeichert werden.');
      return false;
    } finally {
      setRestaurantLoading(false);
    }
  };

  const updateRestaurantCateringOffer = async (offerId, payload) => {
    if (!authToken) {
      setRestaurantError('Bitte zuerst einloggen.');
      return false;
    }
    setRestaurantLoading(true);
    setRestaurantError('');
    try {
      await api.updateRestaurantCateringOffer(authToken, offerId, payload);
      await loadRestaurantCateringOffers(authToken);
      return true;
    } catch (error) {
      if (isUnauthorizedError(error)) {
        await clearRestaurantSession();
        return false;
      }
      setRestaurantError(error?.message || 'Catering-Angebot konnte nicht aktualisiert werden.');
      return false;
    } finally {
      setRestaurantLoading(false);
    }
  };

  const removeRestaurantCateringOffer = async (offerId) => {
    if (!authToken) {
      setRestaurantError('Bitte zuerst einloggen.');
      return false;
    }
    setRestaurantLoading(true);
    setRestaurantError('');
    try {
      await api.deleteRestaurantCateringOffer(authToken, offerId);
      setRestaurantCateringOffers((current) => current.filter((offer) => offer.id !== offerId));
      return true;
    } catch (error) {
      if (isUnauthorizedError(error)) {
        await clearRestaurantSession();
        return false;
      }
      setRestaurantError(error?.message || 'Catering-Angebot konnte nicht gelöscht werden.');
      return false;
    } finally {
      setRestaurantLoading(false);
    }
  };

  const uploadRestaurantCateringImage = async (file) => {
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
      const data = await api.uploadRestaurantCateringImage(authToken, file);
      return normalizeRemoteUrl(data?.imageUrl) || null;
    } catch (error) {
      if (isUnauthorizedError(error)) {
        await clearRestaurantSession();
        return null;
      }
      setRestaurantError(error?.message || 'Catering-Bild konnte nicht hochgeladen werden.');
      return null;
    } finally {
      setRestaurantLoading(false);
    }
  };

  const logout = () => {
    const token = authToken;
    const pushToken = registeredPushToken;
    if (token && pushToken && Platform.OS !== 'web') {
      void api.unregisterRestaurantPushToken(token, { token: pushToken }).catch(() => undefined);
    }

    void clearStoredRestaurantSession();
    clearRestaurantAuthState();
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
      if (isUnauthorizedError(error)) {
        await clearRestaurantSession();
        return false;
      }
      setRestaurantError(error?.message || 'Bestellung konnte nicht aktualisiert werden.');
      return false;
    } finally {
      setRestaurantLoading(false);
    }
  };

  const removeRestaurantOrder = async (orderId) => {
    if (!authToken) {
      setRestaurantError('Bitte zuerst einloggen.');
      return false;
    }

    setRestaurantLoading(true);
    setRestaurantError('');
    try {
      await api.deleteRestaurantOrder(authToken, orderId);
      await loadRestaurantOrders(authToken);
      return true;
    } catch (error) {
      if (isUnauthorizedError(error)) {
        await clearRestaurantSession();
        return false;
      }
      setRestaurantError(error?.message || 'Bestellung konnte nicht gelöscht werden.');
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
      if (isUnauthorizedError(error)) {
        await clearRestaurantSession();
        return false;
      }
      setRestaurantError(error?.message || 'Reservierung konnte nicht aktualisiert werden.');
      return false;
    } finally {
      setRestaurantLoading(false);
    }
  };

  const replyRestaurantReview = async (reviewId, text) => {
    if (!authToken) {
      setRestaurantError('Bitte zuerst einloggen.');
      return null;
    }

    setRestaurantLoading(true);
    setRestaurantError('');
    try {
      const updated = mapReview(await api.replyRestaurantReview(authToken, reviewId, { text }));
      setRestaurantReviews((prev) =>
        prev.map((review) => (review.id === updated.id ? updated : review))
      );
      return updated;
    } catch (error) {
      if (isUnauthorizedError(error)) {
        await clearRestaurantSession();
        return null;
      }
      setRestaurantError(error?.message || 'Antwort konnte nicht gespeichert werden.');
      return null;
    } finally {
      setRestaurantLoading(false);
    }
  };

  const markRestaurantReviewRead = async (reviewId) => {
    if (!authToken) return null;
    try {
      const updated = mapReview(await api.markRestaurantReviewRead(authToken, reviewId));
      setRestaurantReviews((prev) =>
        prev.map((review) => (review.id === updated.id ? updated : review))
      );
      return updated;
    } catch (error) {
      if (isUnauthorizedError(error)) {
        await clearRestaurantSession();
      }
      return null;
    }
  };

  const reportRestaurantReview = async (reviewId, payload) => {
    if (!authToken) {
      setRestaurantError('Bitte zuerst einloggen.');
      return null;
    }
    setRestaurantLoading(true);
    setRestaurantError('');
    try {
      const response = await api.reportRestaurantReview(authToken, reviewId, payload);
      const updated = mapReview(response?.review || response);
      setRestaurantReviews((prev) =>
        prev.map((review) => (review.id === updated.id ? updated : review))
      );
      return updated;
    } catch (error) {
      if (isUnauthorizedError(error)) {
        await clearRestaurantSession();
        return null;
      }
      setRestaurantError(error?.message || 'Bewertung konnte nicht gemeldet werden.');
      return null;
    } finally {
      setRestaurantLoading(false);
    }
  };

  const uploadRestaurantMenu = async (file, mode = 'replace') => {
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
      const data = await api.uploadRestaurantMenu(authToken, file, mode);
      const mappedRestaurant = mapRestaurant(data?.restaurant) || restaurant;
      if (mappedRestaurant) {
        setRestaurant(mappedRestaurant);
      }
      await loadRestaurantOffers(authToken, mappedRestaurant);
      return true;
    } catch (error) {
      if (isUnauthorizedError(error)) {
        await clearRestaurantSession();
        return false;
      }
      const message = getMenuErrorMessage(error, 'Menü konnte nicht hochgeladen werden.');
      setRestaurantError(message);
      const uploadError = new Error(message);
      uploadError.code = error?.code;
      uploadError.diagnosticId = error?.diagnosticId;
      uploadError.payload = error?.payload;
      throw uploadError;
    } finally {
      setRestaurantLoading(false);
    }
  };

  const uploadRestaurantOnboardingMenu = async (files, kind = 'regular') => {
    if (!authToken) {
      setRestaurantError('Bitte zuerst einloggen.');
      return null;
    }
    const normalizedFiles = (Array.isArray(files) ? files : [files]).filter(
      (file) => file?.uri || file?.file
    );
    if (!normalizedFiles.length) {
      setRestaurantError('Keine Datei ausgewählt.');
      return null;
    }

    setRestaurantLoading(true);
    setRestaurantError('');
    try {
      const normalizedKind = kind === 'lunch' ? 'lunch' : 'regular';
      const data = await api.uploadRestaurantOnboardingMenu(authToken, normalizedFiles, normalizedKind);
      const mappedRestaurant = mapRestaurant(data?.restaurant) || restaurant;
      if (mappedRestaurant) {
        setRestaurant(mappedRestaurant);
      }
      return {
        menuFiles:
          (normalizedKind === 'lunch'
            ? mappedRestaurant?.onboardingDraft?.lunchMenuFiles
            : mappedRestaurant?.onboardingDraft?.menuFiles) ||
          normalizeMenuFiles(data?.menuFiles, undefined, undefined, 'onboarding'),
        onboardingDraft:
          mappedRestaurant?.onboardingDraft || normalizeOnboardingDraft(data?.onboardingDraft)
      };
    } catch (error) {
      if (isUnauthorizedError(error)) {
        await clearRestaurantSession();
        return null;
      }
      const message = getMenuErrorMessage(error, 'Speisekarte konnte nicht hochgeladen werden.');
      setRestaurantError(message);
      const uploadError = new Error(message);
      uploadError.code = error?.code;
      uploadError.diagnosticId = error?.diagnosticId;
      uploadError.payload = error?.payload;
      throw uploadError;
    } finally {
      setRestaurantLoading(false);
    }
  };

  const deleteRestaurantMenu = async () => {
    if (!authToken) {
      setRestaurantError('Bitte zuerst einloggen.');
      return false;
    }

    setRestaurantLoading(true);
    setRestaurantError('');
    try {
      const data = await api.deleteRestaurantMenu(authToken);
      const mappedRestaurant = mapRestaurant(data?.restaurant) || restaurant;
      if (mappedRestaurant) {
        setRestaurant(mappedRestaurant);
        await loadRestaurantOffers(authToken, mappedRestaurant);
      }
      return true;
    } catch (error) {
      if (isUnauthorizedError(error)) {
        await clearRestaurantSession();
        return false;
      }
      setRestaurantError(error?.message || 'Menü konnte nicht gelöscht werden.');
      return false;
    } finally {
      setRestaurantLoading(false);
    }
  };

  const deleteRestaurantMenuCard = async (kind = 'regular', onboarding = false) => {
    if (!authToken) {
      throw new Error('Bitte zuerst einloggen.');
    }

    try {
      const data = await api.deleteRestaurantMenuCard(authToken, kind, onboarding);
      const mappedRestaurant = mapRestaurant(data?.restaurant) || restaurant;
      if (mappedRestaurant) {
        setRestaurant(mappedRestaurant);
        await loadRestaurantOffers(authToken, mappedRestaurant);
      }
      return data || { menu: { items: [], allergens: [] }, updatedAt: null };
    } catch (error) {
      if (isUnauthorizedError(error)) {
        await clearRestaurantSession();
        throw new Error('Bitte erneut einloggen.');
      }
      throw error;
    }
  };

  const generateRestaurantDigitalMenu = useCallback(async (files, kind = 'regular') => {
    if (!authToken) {
      throw new Error('Bitte zuerst einloggen.');
    }
    const normalizedFiles = (Array.isArray(files) ? files : [files]).filter(
      (file) => file?.uri || file?.file
    );
    if (!normalizedFiles.length) {
      throw new Error('Keine Datei ausgewählt.');
    }
    try {
      const data = await api.generateRestaurantDigitalMenu(authToken, normalizedFiles, kind);
      return data || null;
    } catch (error) {
      if (isUnauthorizedError(error)) {
        await clearRestaurantSession();
        throw new Error('Bitte erneut einloggen.');
      }
      const raw = String(error?.message || '');
      const lowered = raw.toLowerCase();
      const message = lowered.includes('insufficient_quota') || lowered.includes('exceeded your current quota')
        ? 'KI-Kontingent aufgebraucht. Bitte Billing/Quota prüfen oder einen anderen API-Key verwenden.'
        : lowered.includes('invalid api key')
        ? 'KI-API-Key ist ungültig. Bitte Key in backend/.env prüfen.'
        : lowered.includes('openai_api_key fehlt')
        ? 'KI ist noch nicht eingerichtet. Bitte API-Key im Server setzen und API neu deployen.'
        : lowered.includes('nicht sicher gelesen') || lowered.includes('unreadable')
        ? 'Die Datei war schwer lesbar. Bitte ein schärferes Bild/PDF hochladen oder manuell nachbearbeiten.'
        : raw || 'Digitales Menü konnte nicht erstellt werden.';
      const diagnosticId = String(error?.diagnosticId || error?.payload?.diagnosticId || '').trim();
      const detailedMessage = diagnosticId && !message.includes(diagnosticId)
        ? `${message} (Fehler-ID: ${diagnosticId})`
        : message;
      const menuError = new Error(detailedMessage);
      menuError.code = error?.code;
      menuError.diagnosticId = error?.diagnosticId;
      menuError.payload = error?.payload;
      throw menuError;
    }
  }, [authToken, clearRestaurantSession]);

  const reportRestaurantMenuDiagnostic = useCallback(async (payload) => {
    if (!authToken) return null;
    try {
      return await api.reportRestaurantMenuDiagnostic(authToken, payload);
    } catch {
      return null;
    }
  }, [authToken]);

  const getRestaurantDigitalMenu = useCallback(async () => {
    if (!authToken) {
      throw new Error('Bitte zuerst einloggen.');
    }
    try {
      const data = await api.getRestaurantDigitalMenu(authToken);
      return data || { menu: { items: [], allergens: [] }, updatedAt: null };
    } catch (error) {
      if (isUnauthorizedError(error)) {
        await clearRestaurantSession();
        throw new Error('Bitte erneut einloggen.');
      }
      throw error;
    }
  }, [authToken, clearRestaurantSession]);

  const getRestaurantLunchMenu = useCallback(async () => {
    if (!authToken) {
      throw new Error('Bitte zuerst einloggen.');
    }
    try {
      const data = await api.getRestaurantLunchMenu(authToken);
      return data || { menu: { items: [], allergens: [] }, updatedAt: null };
    } catch (error) {
      if (isUnauthorizedError(error)) {
        await clearRestaurantSession();
        throw new Error('Bitte erneut einloggen.');
      }
      throw error;
    }
  }, [authToken, clearRestaurantSession]);

  const getRestaurantOnboardingDigitalMenu = useCallback(async () => {
    if (!authToken) {
      throw new Error('Bitte zuerst einloggen.');
    }
    try {
      const data = await api.getRestaurantOnboardingDigitalMenu(authToken);
      return data || { menu: { items: [], allergens: [] }, updatedAt: null };
    } catch (error) {
      if (isUnauthorizedError(error)) {
        await clearRestaurantSession();
        throw new Error('Bitte erneut einloggen.');
      }
      throw error;
    }
  }, [authToken, clearRestaurantSession]);

  const getRestaurantOnboardingLunchMenu = useCallback(async () => {
    if (!authToken) {
      throw new Error('Bitte zuerst einloggen.');
    }
    try {
      const data = await api.getRestaurantOnboardingLunchMenu(authToken);
      return data || { menu: { items: [], allergens: [] }, updatedAt: null };
    } catch (error) {
      if (isUnauthorizedError(error)) {
        await clearRestaurantSession();
        throw new Error('Bitte erneut einloggen.');
      }
      throw error;
    }
  }, [authToken, clearRestaurantSession]);

  const saveRestaurantDigitalMenu = useCallback(async (payload) => {
    if (!authToken) {
      throw new Error('Bitte zuerst einloggen.');
    }
    try {
      const data = await api.saveRestaurantDigitalMenu(authToken, payload);
      return data || { menu: { items: [], allergens: [] }, updatedAt: null, warnings: [] };
    } catch (error) {
      if (isUnauthorizedError(error)) {
        await clearRestaurantSession();
        throw new Error('Bitte erneut einloggen.');
      }
      throw error;
    }
  }, [authToken, clearRestaurantSession]);

  const saveRestaurantLunchMenu = useCallback(async (payload) => {
    if (!authToken) {
      throw new Error('Bitte zuerst einloggen.');
    }
    try {
      const data = await api.saveRestaurantLunchMenu(authToken, payload);
      return data || { menu: { items: [], allergens: [] }, updatedAt: null, warnings: [] };
    } catch (error) {
      if (isUnauthorizedError(error)) {
        await clearRestaurantSession();
        throw new Error('Bitte erneut einloggen.');
      }
      throw error;
    }
  }, [authToken, clearRestaurantSession]);

  const getRestaurantMenuAnalytics = useCallback(async (range) => {
    if (!authToken) {
      throw new Error('Bitte zuerst einloggen.');
    }
    try {
      return await api.getRestaurantMenuAnalytics(authToken, range);
    } catch (error) {
      if (isUnauthorizedError(error)) {
        await clearRestaurantSession();
        throw new Error('Bitte erneut einloggen.');
      }
      throw error;
    }
  }, [authToken, clearRestaurantSession]);

  const saveRestaurantOnboardingDigitalMenu = useCallback(async (payload) => {
    if (!authToken) {
      throw new Error('Bitte zuerst einloggen.');
    }
    try {
      const data = await api.saveRestaurantOnboardingDigitalMenu(authToken, payload);
      return data || { menu: { items: [], allergens: [] }, updatedAt: null, warnings: [] };
    } catch (error) {
      if (isUnauthorizedError(error)) {
        await clearRestaurantSession();
        throw new Error('Bitte erneut einloggen.');
      }
      throw error;
    }
  }, [authToken, clearRestaurantSession]);

  const saveRestaurantOnboardingLunchMenu = useCallback(async (payload) => {
    if (!authToken) {
      throw new Error('Bitte zuerst einloggen.');
    }
    try {
      const data = await api.saveRestaurantOnboardingLunchMenu(authToken, payload);
      return data || { menu: { items: [], allergens: [] }, updatedAt: null, warnings: [] };
    } catch (error) {
      if (isUnauthorizedError(error)) {
        await clearRestaurantSession();
        throw new Error('Bitte erneut einloggen.');
      }
      throw error;
    }
  }, [authToken, clearRestaurantSession]);

  const completeRestaurantOnboarding = async () => {
    if (!authToken) {
      setRestaurantError('Bitte zuerst einloggen.');
      return false;
    }

    setRestaurantLoading(true);
    setRestaurantError('');
    try {
      const data = await api.completeRestaurantOnboarding(authToken);
      const mappedRestaurant = mapRestaurant(data?.restaurant);
      if (mappedRestaurant) {
        setRestaurant(mappedRestaurant);
        await loadRestaurantOffers(authToken, mappedRestaurant);
      }
      return Boolean(mappedRestaurant);
    } catch (error) {
      if (isUnauthorizedError(error)) {
        await clearRestaurantSession();
        return false;
      }
      setRestaurantError(error?.message || 'Einrichtung konnte nicht abgeschlossen werden.');
      return false;
    } finally {
      setRestaurantLoading(false);
    }
  };

  const sendRestaurantSupportRequest = async (payload) => {
    if (!authToken) {
      setRestaurantError('Bitte zuerst einloggen.');
      return false;
    }

    setRestaurantLoading(true);
    setRestaurantError('');
    try {
      await api.sendRestaurantSupportRequest(authToken, payload);
      return true;
    } catch (error) {
      if (isUnauthorizedError(error)) {
        await clearRestaurantSession();
        return false;
      }
      setRestaurantError(error?.message || 'Support-Nachricht konnte nicht gesendet werden.');
      return false;
    } finally {
      setRestaurantLoading(false);
    }
  };

  const getRestaurantSupportChat = async () => {
    if (!authToken) {
      throw new Error('Bitte zuerst einloggen.');
    }
    try {
      const data = await api.getRestaurantSupportChat(authToken);
      return Array.isArray(data?.messages) ? data.messages : [];
    } catch (error) {
      if (isUnauthorizedError(error)) {
        await clearRestaurantSession();
      }
      throw error;
    }
  };

  const sendRestaurantSupportChatMessage = async (message) => {
    if (!authToken) {
      throw new Error('Bitte zuerst einloggen.');
    }
    try {
      const data = await api.sendRestaurantSupportChatMessage(authToken, message);
      if (!data?.message) {
        throw new Error('Der Assistent konnte gerade nicht antworten. Erneut versuchen.');
      }
      return data.message;
    } catch (error) {
      if (isUnauthorizedError(error)) {
        await clearRestaurantSession();
      }
      throw error;
    }
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
      if (isUnauthorizedError(error)) {
        await clearRestaurantSession();
        return null;
      }
      setRestaurantError(error?.message || 'Bild konnte nicht hochgeladen werden.');
      return null;
    } finally {
      setRestaurantLoading(false);
    }
  };

  const uploadRestaurantEventImage = async (file) => {
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
      const data = await api.uploadRestaurantEventImage(authToken, file);
      return normalizeRemoteUrl(data?.imageUrl) || null;
    } catch (error) {
      if (isUnauthorizedError(error)) {
        await clearRestaurantSession();
        return null;
      }
      setRestaurantError(error?.message || 'Eventbild konnte nicht hochgeladen werden.');
      return null;
    } finally {
      setRestaurantLoading(false);
    }
  };

  const createRestaurantEvent = async (payload) => {
    if (!authToken) {
      setRestaurantError('Bitte zuerst einloggen.');
      return null;
    }

    setRestaurantLoading(true);
    setRestaurantError('');
    try {
      const created = mapEvent(await api.createRestaurantEvent(authToken, payload));
      await loadRestaurantEvents(authToken);
      return created;
    } catch (error) {
      if (isUnauthorizedError(error)) {
        await clearRestaurantSession();
        return null;
      }
      setRestaurantError(error?.message || 'Event konnte nicht gespeichert werden.');
      return null;
    } finally {
      setRestaurantLoading(false);
    }
  };

  const updateRestaurantEvent = async (eventId, payload) => {
    if (!authToken) {
      setRestaurantError('Bitte zuerst einloggen.');
      return null;
    }
    const id = String(eventId || '').trim();
    if (!id) {
      setRestaurantError('Event fehlt.');
      return null;
    }

    setRestaurantLoading(true);
    setRestaurantError('');
    try {
      const updated = mapEvent(await api.updateRestaurantEvent(authToken, id, payload));
      setRestaurantEvents((prev) =>
        prev.map((event) => (event.id === updated.id ? updated : event))
      );
      return updated;
    } catch (error) {
      if (isUnauthorizedError(error)) {
        await clearRestaurantSession();
        return null;
      }
      setRestaurantError(error?.message || 'Event konnte nicht aktualisiert werden.');
      return null;
    } finally {
      setRestaurantLoading(false);
    }
  };

  const removeRestaurantEvent = async (eventId) => {
    if (!authToken) {
      setRestaurantError('Bitte zuerst einloggen.');
      return false;
    }
    const id = String(eventId || '').trim();
    if (!id) {
      setRestaurantError('Event fehlt.');
      return false;
    }

    setRestaurantLoading(true);
    setRestaurantError('');
    try {
      await api.deleteRestaurantEvent(authToken, id);
      setRestaurantEvents((prev) => prev.filter((event) => event.id !== id));
      return true;
    } catch (error) {
      if (isUnauthorizedError(error)) {
        await clearRestaurantSession();
        return false;
      }
      setRestaurantError(error?.message || 'Event konnte nicht gelöscht werden.');
      return false;
    } finally {
      setRestaurantLoading(false);
    }
  };

  const cancelRestaurantEventOccurrence = async (eventId, occurrenceStartAt, reason = '') => {
    if (!authToken) {
      setRestaurantError('Bitte zuerst einloggen.');
      return false;
    }
    setRestaurantLoading(true);
    setRestaurantError('');
    try {
      await api.cancelRestaurantEventOccurrence(authToken, eventId, {
        occurrenceStartAt,
        reason
      });
      await loadRestaurantEvents(authToken);
      return true;
    } catch (error) {
      if (isUnauthorizedError(error)) {
        await clearRestaurantSession();
        return false;
      }
      setRestaurantError(error?.message || 'Termin konnte nicht abgesagt werden.');
      return false;
    } finally {
      setRestaurantLoading(false);
    }
  };

  const restoreRestaurantEventOccurrence = async (eventId, cancellationId) => {
    if (!authToken) {
      setRestaurantError('Bitte zuerst einloggen.');
      return false;
    }
    setRestaurantLoading(true);
    setRestaurantError('');
    try {
      await api.restoreRestaurantEventOccurrence(authToken, eventId, cancellationId);
      await loadRestaurantEvents(authToken);
      return true;
    } catch (error) {
      if (isUnauthorizedError(error)) {
        await clearRestaurantSession();
        return false;
      }
      setRestaurantError(error?.message || 'Absage konnte nicht aufgehoben werden.');
      return false;
    } finally {
      setRestaurantLoading(false);
    }
  };

  const uploadRestaurantLogo = async (file) => {
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
      const data = await api.uploadRestaurantLogo(authToken, file);
      const logoUrl = normalizeRemoteUrl(data?.logoUrl);
      if (logoUrl) {
        setRestaurant((prev) =>
          prev
            ? {
                ...prev,
                logoUrl
              }
            : prev
        );
      }
      return logoUrl || null;
    } catch (error) {
      if (isUnauthorizedError(error)) {
        await clearRestaurantSession();
        return null;
      }
      setRestaurantError(error?.message || 'Logo konnte nicht hochgeladen werden.');
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
    return data || { menu: { items: [], allergens: [] }, updatedAt: null };
  };

  const getPublicRestaurantLunchMenu = async (restaurantId) => {
    if (!restaurantId) {
      throw new Error('Restaurant fehlt.');
    }
    const data = await api.getPublicRestaurantLunchMenu(restaurantId);
    return data || { menu: { items: [], allergens: [] }, updatedAt: null };
  };

  const trackPublicRestaurantMenuView = async (restaurantId, kind) => {
    if (!restaurantId) return null;
    try {
      return await api.trackPublicRestaurantMenuView(restaurantId, kind);
    } catch {
      // Statistics must never prevent a user from opening a menu.
      return null;
    }
  };

  const trackPublicRestaurantContentView = async (restaurantId, payload) => {
    if (!restaurantId || !payload?.type || !payload?.contentId) return null;
    try {
      return await api.trackPublicRestaurantContentView(restaurantId, payload);
    } catch {
      // Statistics must never prevent a user from opening an offer or dish.
      return null;
    }
  };

  const getPublicRestaurantReviews = async (restaurantId) => {
    if (!restaurantId) {
      throw new Error('Restaurant fehlt.');
    }
    const data = await api.getPublicRestaurantReviews(restaurantId);
    return Array.isArray(data) ? data.map(mapReview) : [];
  };

  const createRestaurantReview = async (restaurantId, payload) => {
    if (!restaurantId) {
      throw new Error('Restaurant fehlt.');
    }
    const data = await api.createRestaurantReview(restaurantId, payload);
    return mapReview(data);
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
      events,
      eventsLoading,
      eventsError,
      eventFavoriteIds,
      fetchEvents,
      cateringProviders,
      cateringLoading,
      cateringError,
      fetchCatering,
      getPublicEvent,
      getPublicOffer,
      followEventProvider,
      unfollowEventProvider,
      authToken,
      restaurant,
      restaurantOffers,
      restaurantOrders,
      restaurantReservations,
      restaurantReviews,
      restaurantEvents,
      restaurantCateringOffers,
      restaurantLoading,
      restaurantError,
      login,
      requestRestaurantPasswordReset,
      confirmRestaurantPasswordReset,
      changeRestaurantPassword,
      registerRestaurant,
      updateRestaurantProfile,
      getRestaurantWebsiteSync,
      startRestaurantWebsiteSync,
      applyRestaurantWebsiteSync,
      updateRestaurantOnboardingDraft,
      completeRestaurantOnboarding,
      sendRestaurantSupportRequest,
      getRestaurantSupportChat,
      sendRestaurantSupportChatMessage,
      markRestaurantOnboardingHintSeen,
      createRestaurantOffer,
      updateRestaurantOffer,
      removeRestaurantOffer,
      loadRestaurantCateringOffers,
      createRestaurantCateringOffer,
      updateRestaurantCateringOffer,
      removeRestaurantCateringOffer,
      uploadRestaurantCateringImage,
      updateRestaurantOrder,
      removeRestaurantOrder,
      updateRestaurantReservation,
      replyRestaurantReview,
      markRestaurantReviewRead,
      reportRestaurantReview,
      uploadRestaurantMenu,
      uploadRestaurantOnboardingMenu,
      deleteRestaurantMenu,
      deleteRestaurantMenuCard,
      generateRestaurantDigitalMenu,
      getRestaurantDigitalMenu,
      getRestaurantLunchMenu,
      getRestaurantOnboardingDigitalMenu,
      getRestaurantOnboardingLunchMenu,
      saveRestaurantDigitalMenu,
      saveRestaurantLunchMenu,
      getRestaurantMenuAnalytics,
      saveRestaurantOnboardingDigitalMenu,
      saveRestaurantOnboardingLunchMenu,
      reportRestaurantMenuDiagnostic,
      uploadRestaurantOfferImage,
      uploadRestaurantEventImage,
      loadRestaurantEvents,
      createRestaurantEvent,
      updateRestaurantEvent,
      removeRestaurantEvent,
      cancelRestaurantEventOccurrence,
      restoreRestaurantEventOccurrence,
      uploadRestaurantLogo,
      getPublicRestaurantDigitalMenu,
      getPublicRestaurantLunchMenu,
      trackPublicRestaurantMenuView,
      trackPublicRestaurantContentView,
      getPublicRestaurantReviews,
      createRestaurantReview,
      loadRestaurantOffers,
      loadRestaurantOrders,
      loadRestaurantReservations,
      loadRestaurantReviews,
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
      events,
      eventsLoading,
      eventsError,
      eventFavoriteIds,
      cateringProviders,
      cateringLoading,
      cateringError,
      authToken,
      restaurant,
      restaurantOffers,
      restaurantOrders,
      restaurantReservations,
      restaurantReviews,
      restaurantEvents,
      restaurantCateringOffers,
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
