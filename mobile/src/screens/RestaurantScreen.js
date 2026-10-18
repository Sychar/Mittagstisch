import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput as NativeTextInput,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  Image,
  Linking,
  Modal,
  InputAccessoryView,
  useWindowDimensions,
  Alert
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Notifications from 'expo-notifications';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, radius, shadow, spacing } from '../theme/theme';
import { useOffers, formatPrice } from '../store/OffersContext';
import EventCard from '../components/EventCard';
import {
  cateringEnabled,
  eventsEnabled,
  reviewReportingEnabled,
  websiteSyncEnabled
} from '../config/features';
import { eventTagOptions } from '../events/eventConfig';

const appIcon = require('../../assets/icon33.jpeg');
const GASTRO_KEYBOARD_ACCESSORY_ID = 'nahundfein-gastro-keyboard';
const MENU_PICKER_BUSY_MESSAGE =
  'Eine Dateiauswahl ist bereits geöffnet. Bitte schließe sie zuerst und versuche es erneut.';
const MENU_PICKER_SHEET_CLOSE_DELAY_MS = 320;
const isMenuPickerInProgressError = (error) =>
  error?.code === 'MENU_PICKER_IN_PROGRESS' ||
  /different document picking in progress|document picking.*in progress/i.test(
    String(error?.message || error || '')
  );

// All gastro forms share one input implementation so Return/Done consistently closes the keyboard.
const TextInput = React.forwardRef(
  (
    {
      multiline = false,
      returnKeyType,
      blurOnSubmit,
      onSubmitEditing,
      inputAccessoryViewID,
      placeholderTextColor,
      ...props
    },
    ref
  ) => {
    const dismissOnSubmit = !multiline;
    return (
      <NativeTextInput
        ref={ref}
        {...props}
        multiline={multiline}
        returnKeyType={returnKeyType || (multiline ? 'default' : 'done')}
        blurOnSubmit={blurOnSubmit ?? dismissOnSubmit}
        placeholderTextColor={placeholderTextColor || colors.muted}
        inputAccessoryViewID={
          Platform.OS === 'ios' && !multiline
            ? GASTRO_KEYBOARD_ACCESSORY_ID
            : inputAccessoryViewID
        }
        onSubmitEditing={(event) => {
          onSubmitEditing?.(event);
          if (dismissOnSubmit) Keyboard.dismiss();
        }}
      />
    );
  }
);
TextInput.displayName = 'GastroTextInput';
const DATENSCHUTZ_URL = 'https://home.nahundfein.com/datenschutz/index.html';
const AGB_URL = 'https://home.nahundfein.com/agb/index.html';
const DEFAULT_MEAL_SLOT = 'lunch';
const mealSlotOptions = [
  { key: 'breakfast', label: 'Frühstück' },
  { key: 'lunch', label: 'Mittagstisch' },
  { key: 'dinner', label: 'Hauptkarte' }
];
const offerTypeOptions = [
  { key: 'normal', label: 'Gericht' },
  { key: 'icecream', label: 'Eis' },
  { key: 'coffee', label: 'Kaffee/Kuchen' }
];
const offerTypeLabelByKey = offerTypeOptions.reduce((acc, option) => {
  acc[option.key] = option.label;
  return acc;
}, {});
const cuisineTypeOptions = [
  'Schwäbisch',
  'Italienisch (Pizza & Pasta)',
  'Indisch',
  'Asiatisch',
  'Café',
  'Bietet vegetarisch',
  'Bietet vegan',
  'Türkisch',
  'Arabisch',
  'Mediterran',
  'Deutsch',
  'Amerikanisch (Burger & Co)',
  'International',
  'Etwas anderes'
];
const cuisineTypeAliasMap = {
  Cafe: 'Café',
  'Café': 'Café',
  Italienisch: 'Italienisch (Pizza & Pasta)',
  'Italienisch (Pizza)': 'Italienisch (Pizza & Pasta)',
  'Italienisch (Pizza & Pasta)': 'Italienisch (Pizza & Pasta)',
  Amerikanisch: 'Amerikanisch (Burger & Co)',
  'Amerikanisch (Burger)': 'Amerikanisch (Burger & Co)',
  'Amerikanisch (Burger & Co)': 'Amerikanisch (Burger & Co)'
};
const mealSlotLabelByKey = mealSlotOptions.reduce((acc, option) => {
  acc[option.key] = option.label;
  return acc;
}, {});
const reservationModeOptions = [
  {
    key: 'disabled',
    title: 'Keine Reservierung',
    text: 'Es wird kein Reservierungsweg angezeigt.'
  },
  {
    key: 'app',
    title: 'Reservierung über App',
    text: 'Gäste senden ihre Anfrage direkt in Nah&Fein.'
  },
  {
    key: 'external',
    title: 'Externe Reservierung',
    text: 'Gäste reservieren über Portal, E-Mail oder Telefon.'
  }
];
const reservationModeLabelByKey = reservationModeOptions.reduce((acc, option) => {
  acc[option.key] = option.title;
  return acc;
}, {});
const openingHourDays = [
  { key: 'mon', label: 'Montag', shortLabel: 'Mo' },
  { key: 'tue', label: 'Dienstag', shortLabel: 'Di' },
  { key: 'wed', label: 'Mittwoch', shortLabel: 'Mi' },
  { key: 'thu', label: 'Donnerstag', shortLabel: 'Do' },
  { key: 'fri', label: 'Freitag', shortLabel: 'Fr' },
  { key: 'sat', label: 'Samstag', shortLabel: 'Sa' },
  { key: 'sun', label: 'Sonntag', shortLabel: 'So' }
];
const DEFAULT_OPEN_TIME = '11:00';
const DEFAULT_CLOSE_TIME = '22:00';
const TIME_PICKER_INTERVAL_MINUTES = 30;
const OPENING_HOURS_PICKER_INTERVAL_MINUTES = 15;
const MAX_DIGITAL_MENU_FILES = 10;
const MAX_MENU_CAMERA_IMAGES = 5;
const websiteSyncMenuAreas = [
  { key: 'breakfast', title: 'Frühstück', icon: 'cafe-outline' },
  { key: 'lunch', title: 'Mittagstisch / Lunch', icon: 'sunny-outline' },
  { key: 'dinner', title: 'Abendessen', icon: 'restaurant-outline' },
  { key: 'drinks', title: 'Getränke', icon: 'wine-outline' }
];
const supportQuickActions = [
  { label: 'Menü mit KI erstellen', message: 'Wie erstelle ich ein Menü mit KI?', color: 'blue', icon: 'sparkles-outline' },
  { label: 'Gericht manuell hinzufügen', message: 'Wie füge ich ein Gericht manuell hinzu?', color: 'green', icon: 'create-outline' },
  { label: 'Angebot erstellen', message: 'Wie erstelle ich ein Angebot?', color: 'orange', icon: 'pricetag-outline' },
  { label: 'Mittagstisch erstellen', message: 'Wie erstelle ich einen Mittagstisch?', color: 'green', icon: 'sunny-outline' },
  { label: 'Mein Restaurant besser sichtbar machen', message: 'Wie mache ich mein Restaurant besser sichtbar?', color: 'blue', icon: 'eye-outline' }
];
const reviewReportReasonOptions = [
  { key: 'fake_or_no_visit', label: 'Fake / kein echter Besuch' },
  { key: 'abusive_or_inappropriate', label: 'Beleidigung oder unangemessener Inhalt' },
  { key: 'wrong_restaurant', label: 'Falsches Restaurant' },
  { key: 'privacy', label: 'Datenschutz / persönliche Daten' },
  { key: 'other', label: 'Sonstiges' }
];
const MAX_MENU_FILE_BYTES = 10 * 1024 * 1024;
const MAX_MENU_BATCH_BYTES = 50 * 1024 * 1024;
const SPECIAL_CLOSURE_PICKER_DAYS = 365;
const CITY_LOOKUP_MIN_CHARS = 2;
const STREET_LOOKUP_MIN_CHARS = 2;
const CITY_LOOKUP_DEBOUNCE_MS = 320;
const specialClosureDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const isoWeekKeyPattern = /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/;
const restaurantTimeZone = 'Europe/Berlin';
const createClientMenuDiagnosticId = () =>
  `MENU-${Math.random().toString(16).slice(2, 10).toUpperCase().padEnd(8, '0').slice(0, 8)}`;
const isIosPhotoRepresentationError = (error) => {
  const message = String(error?.message || error || '').toLowerCase();
  return (
    message.includes('failed to read picked image') ||
    message.includes('cannot load representation') ||
    /public\.(jpe?g|heic|heif)/.test(message)
  );
};

const createDefaultOpeningHours = () =>
  openingHourDays.reduce((acc, day) => {
    acc[day.key] = {
      enabled: false,
      openTime: DEFAULT_OPEN_TIME,
      closeTime: DEFAULT_CLOSE_TIME,
      periods: [],
      openEnded: false
    };
    return acc;
  }, {});

const sanitizeTimeInput = (value) => String(value || '').replace(/[^0-9:]/g, '').slice(0, 5);

const normalizeTimeInput = (value, fallback) => {
  const raw = String(value || '').trim().replace('.', ':');
  const match = raw.match(/^(\d{1,2})(?::?(\d{2}))?$/);
  if (!match) return fallback;
  const hour = Number(match[1]);
  const minute = Number(match[2] ?? '00');
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return fallback;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return fallback;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

const timeTextToDate = (value, fallback = DEFAULT_OPEN_TIME) => {
  const normalized = normalizeTimeInput(value, fallback);
  const [hour, minute] = normalized.split(':').map((entry) => Number(entry));
  const nextDate = new Date();
  nextDate.setHours(hour, minute, 0, 0);
  return nextDate;
};

const roundDateToTimeInterval = (date, interval = TIME_PICKER_INTERVAL_MINUTES) => {
  const nextDate = new Date(date);
  const totalMinutes = nextDate.getHours() * 60 + nextDate.getMinutes();
  const roundedMinutes = Math.max(
    0,
    Math.min(23 * 60 + 30, Math.round(totalMinutes / interval) * interval)
  );
  nextDate.setHours(Math.floor(roundedMinutes / 60), roundedMinutes % 60, 0, 0);
  return nextDate;
};

const formatPickerTimeText = (date) =>
  `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

const allowedMenuMimeTypes = new Set([
  'application/pdf',
  'application/octet-stream',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif'
]);
const menuMimeTypeByExtension = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif'
};

const normalizeAllowedMenuMimeType = (mimeType) => {
  const rawMimeType = String(mimeType || '').toLowerCase().trim();
  const normalizedMimeType = rawMimeType === 'image/jpg' ? 'image/jpeg' : rawMimeType;
  return allowedMenuMimeTypes.has(normalizedMimeType) ? normalizedMimeType : '';
};

const inferMenuMimeTypeFromName = (value) => {
  const cleanValue = String(value || '')
    .split(/[?#]/)[0]
    .toLowerCase()
    .trim();
  const extension = cleanValue.match(/\.([a-z0-9]+)$/)?.[1] || '';
  return menuMimeTypeByExtension[extension] || '';
};

const isAllowedMenuMimeType = (mimeType) => Boolean(normalizeAllowedMenuMimeType(mimeType));

const inferMenuMimeType = (asset) => {
  const rawMimeType = normalizeAllowedMenuMimeType(asset?.mimeType || asset?.type);
  if (rawMimeType) return rawMimeType;

  const inferredMimeType =
    inferMenuMimeTypeFromName(asset?.name) ||
    inferMenuMimeTypeFromName(asset?.fileName) ||
    inferMenuMimeTypeFromName(asset?.uri);
  if (inferredMimeType) return inferredMimeType;

  return 'application/octet-stream';
};

const extensionForMenuMimeType = (mimeType) => {
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/heic') return 'heic';
  if (mimeType === 'image/heif') return 'heif';
  return 'bin';
};

const resolveMenuAssetName = (asset, fallbackPrefix, mimeType) => {
  const rawName = String(asset?.name || asset?.fileName || '').trim();
  if (rawName && inferMenuMimeTypeFromName(rawName)) return rawName;
  return `${fallbackPrefix}-${Date.now()}.${extensionForMenuMimeType(mimeType)}`;
};

const normalizeMenuAsset = (asset, fallbackPrefix = 'menu-upload') => {
  if (!asset?.uri) return null;
  const mimeType = inferMenuMimeType(asset);

  return {
    uri: asset.uri,
    name: resolveMenuAssetName(asset, fallbackPrefix, mimeType),
    mimeType,
    fileSize: Number(asset.fileSize || asset.size || asset.file?.size || 0) || 0,
    file: asset.file
  };
};

const normalizeMenuAssets = (assets, fallbackPrefix = 'menu-upload') =>
  (Array.isArray(assets) ? assets : [])
    .map((asset, index) => normalizeMenuAsset(asset, `${fallbackPrefix}-${index + 1}`))
    .filter(Boolean);

const toCitySuggestion = (entry, rawQuery = '') => {
  const query = String(rawQuery || '').trim().toLowerCase();
  const cityName = String(entry?.name || '').trim();
  if (!cityName) return null;
  if (query && !cityName.toLowerCase().startsWith(query)) return null;

  const stateName = String(entry?.federalState?.name || '').trim();
  const postcode = String(entry?.postalCode || '').trim();
  const municipalityType = String(entry?.municipality?.type || '').trim();

  return {
    id: `${cityName}-${stateName}-${postcode}`.toLowerCase(),
    city: cityName,
    state: stateName,
    postcode,
    label: stateName ? `${cityName}, ${stateName}` : cityName,
    municipalityType
  };
};

const toStreetSuggestion = (entry, rawQuery = '') => {
  const query = String(rawQuery || '').trim().toLowerCase();
  const streetName = String(entry?.name || '').trim();
  if (!streetName) return null;
  if (query && !streetName.toLowerCase().startsWith(query)) return null;

  const locality = String(entry?.locality || '').trim();
  const postcode = String(entry?.postalCode || '').trim();
  const stateName = String(entry?.federalState?.name || '').trim();

  return {
    id: `${streetName}-${locality}-${postcode}`.toLowerCase(),
    street: streetName,
    locality,
    postcode,
    state: stateName,
    label: streetName,
    meta: [locality, postcode ? `PLZ ${postcode}` : null].filter(Boolean).join(' - ')
  };
};

const escapeRegexPattern = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeOpeningPeriods = (value, fallbackOpenTime, fallbackCloseTime, enabled) => {
  if (!enabled) return [];
  const source = Array.isArray(value) ? value : [];
  const periods = source
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => ({
      openTime: normalizeTimeInput(entry.openTime, fallbackOpenTime),
      closeTime: normalizeTimeInput(entry.closeTime, fallbackCloseTime)
    }))
    .filter(
      (entry, index, entries) =>
        entry.openTime !== entry.closeTime &&
        entries.findIndex(
          (candidate) => candidate.openTime === entry.openTime && candidate.closeTime === entry.closeTime
        ) === index
    )
    .slice(0, 2);
  return periods.length ? periods : [{ openTime: fallbackOpenTime, closeTime: fallbackCloseTime }];
};

const normalizeOpeningHours = (value) => {
  const base = createDefaultOpeningHours();
  if (!value || typeof value !== 'object') return base;
  openingHourDays.forEach((day) => {
    const source = value[day.key];
    if (!source || typeof source !== 'object') return;
    const enabled = Boolean(source.enabled);
    const openTime = normalizeTimeInput(source.openTime, DEFAULT_OPEN_TIME);
    const closeTime = normalizeTimeInput(source.closeTime, DEFAULT_CLOSE_TIME);
    const periods = normalizeOpeningPeriods(source.periods, openTime, closeTime, enabled);
    base[day.key] = {
      enabled,
      openTime: periods[0]?.openTime || openTime,
      closeTime: periods[0]?.closeTime || closeTime,
      periods,
      openEnded: enabled && Boolean(source.openEnded)
    };
  });
  return base;
};

const openingTimeOptions = Array.from({ length: 24 * (60 / OPENING_HOURS_PICKER_INTERVAL_MINUTES) }, (_, index) => {
  const totalMinutes = index * OPENING_HOURS_PICKER_INTERVAL_MINUTES;
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
});

const toIsoDateText = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatIsoDateLabel = (value) => {
  const text = String(value || '').trim();
  if (!specialClosureDatePattern.test(text)) return text || 'Datum wählen';
  const parsed = new Date(`${text}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return text;
  return parsed.toLocaleDateString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
};

const createMenuAnalyticsRange = () => {
  const to = new Date();
  const from = new Date(to.getFullYear(), to.getMonth(), to.getDate() - 6, 12);
  return { from: toIsoDateText(from), to: toIsoDateText(to) };
};

const parseMenuAnalyticsDate = (value) => {
  const text = String(value || '').trim();
  if (!specialClosureDatePattern.test(text)) return new Date();
  const parsed = new Date(`${text}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

const normalizeSpecialClosureEntries = (value) => {
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

const buildSpecialClosureDateOptions = (days = SPECIAL_CLOSURE_PICKER_DAYS) => {
  const options = [];
  const now = new Date();
  for (let offset = 0; offset < days; offset += 1) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    const key = toIsoDateText(date);
    options.push({
      key,
      label: formatIsoDateLabel(key)
    });
  }
  return options;
};

const buildLunchValidityDateOptions = (days = 380) => {
  const options = [];
  const now = new Date();
  for (let offset = -14; offset < days; offset += 1) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, 12);
    const key = toIsoDateText(date);
    options.push({ key, label: formatIsoDateLabel(key) });
  }
  return options;
};

const toMinutes = (timeText) => {
  const [hourText, minuteText] = String(timeText || '00:00').split(':');
  const hour = Number(hourText || 0);
  const minute = Number(minuteText || 0);
  return hour * 60 + minute;
};
const dashboardPanels = [
  {
    key: 'statistics',
    title: 'Statistik',
    text: 'Aufrufe und Interesse ansehen',
    icon: 'stats-chart-outline',
    colors: ['#5777C7', '#344D98'],
    statisticsFeature: true
  },
  {
    key: 'myMenu',
    title: 'Mein Menü',
    text: 'Speisekarten öffnen und bearbeiten',
    icon: 'restaurant-outline',
    colors: ['#08B8C8', '#168EDC'],
    foodOnly: true
  },
  {
    key: 'offers',
    title: 'Meine Angebote',
    text: 'Erstellen und aktive Angebote verwalten',
    icon: 'pricetags-outline',
    colors: ['#FFB547', '#F97316'],
    foodOnly: true
  },
  {
    key: 'reviews',
    title: 'Bewertungen',
    text: 'Lesen und öffentlich antworten',
    icon: 'star-outline',
    colors: ['#F3C552', '#E49A19']
  },
  {
    key: 'services',
    title: 'Events & Catering',
    text: 'Events und Catering-Angebote verwalten',
    icon: 'sparkles-outline',
    colors: ['#22B89A', '#087F76'],
    servicesFeature: true
  },
  {
    key: 'requests',
    title: 'Anfragen',
    text: 'Bestellungen und Reservierungen',
    icon: 'notifications-outline',
    colors: ['#F27A79', '#D64C72'],
    foodOnly: true
  }
];
const providerScopeOptions = [
  { key: 'food', title: 'Essen', text: 'Speisekarten, Mittagstisch und Angebote verwalten.' },
  { key: 'events', title: 'Events', text: 'Veranstaltungen, Tickets und Kontaktlinks veröffentlichen.' },
  { key: 'catering', title: 'Catering', text: 'Catering-Angebot, Kontakt und Adresse veröffentlichen.' }
];
const emptyEventForm = {
  id: null,
  title: '',
  description: '',
  tags: [],
  primaryTag: '',
  venueName: '',
  address: '',
  postalCode: '',
  startAtText: '',
  endAtText: '',
  scheduledOccurrences: [],
  recurrenceType: 'none',
  recurrenceWeekdays: [],
  recurrenceEndMode: 'open',
  recurrenceEndAtText: '',
  socialLinks: [],
  imageUrl: '',
  ticketUrl: '',
  contactUrl: '',
  contactEmail: '',
  contactPhone: '',
  active: true
};
const eventWeekdayOptions = [
  { key: 'mon', label: 'Mo', fullLabel: 'Montag' },
  { key: 'tue', label: 'Di', fullLabel: 'Dienstag' },
  { key: 'wed', label: 'Mi', fullLabel: 'Mittwoch' },
  { key: 'thu', label: 'Do', fullLabel: 'Donnerstag' },
  { key: 'fri', label: 'Fr', fullLabel: 'Freitag' },
  { key: 'sat', label: 'Sa', fullLabel: 'Samstag' },
  { key: 'sun', label: 'So', fullLabel: 'Sonntag' }
];
const eventWeekdayKeys = eventWeekdayOptions.map((day) => day.key);
const normalizeEventWeekdaysForEdit = (value) =>
  eventWeekdayKeys.filter((dayKey) => Array.isArray(value) && value.includes(dayKey));
const getEventWeekdayFromDate = (date) => {
  const indexToKey = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  return indexToKey[date.getDay()] || 'mon';
};
const restaurantOnboardingSteps = [
  { key: 'mealSlots', title: 'Bereiche' },
  { key: 'cuisine', title: 'Küche' },
  { key: 'reservations', title: 'Reservierung' },
  { key: 'openingHours', title: 'Öffnungszeiten' },
  { key: 'about', title: 'Über uns' },
  { key: 'menu', title: 'Speisekarten optional' },
  { key: 'summary', title: 'Zusammenfassung' }
];
const emptySocialLink = { platform: 'Website', url: '' };
const normalizeSocialLinksForEdit = (links) => {
  const normalized = (Array.isArray(links) ? links : [])
    .map((entry) => ({
      platform: String(entry?.platform || 'Website').trim() || 'Website',
      url: String(entry?.url || '').trim()
    }))
    .filter((entry) => entry.platform || entry.url);
  return normalized.length ? normalized : [{ ...emptySocialLink }];
};
const prepareSocialLinksPayload = (links) => {
  const payload = [];
  for (const entry of Array.isArray(links) ? links : []) {
    const platform = String(entry?.platform || 'Website').trim() || 'Website';
    const rawUrl = String(entry?.url || '').trim();
    if (!rawUrl) continue;
    const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
    if (!/^https?:\/\/[^\s]+\.[^\s]+/i.test(url)) {
      return { error: `Social-Link prüfen: ${rawUrl}` };
    }
    payload.push({ platform, url });
  }
  return { links: payload.slice(0, 12), error: '' };
};
const normalizeProviderScopesForEdit = (value) => {
  const source = Array.isArray(value) ? value : [];
  const scopes = source.filter((entry) => entry === 'food' || entry === 'events' || entry === 'catering');
  const unique = Array.from(new Set(scopes));
  return unique.length ? unique : ['food'];
};
const toggleProviderScopeValue = (current, scope) => {
  const normalized = normalizeProviderScopesForEdit(current);
  if (normalized.includes(scope)) {
    const next = normalized.filter((entry) => entry !== scope);
    return next.length ? next : [scope];
  }
  return [...normalized, scope];
};
const toEventInputText = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${toIsoDateText(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};
const eventInputTextToDate = (value) => {
  const raw = String(value || '').trim().replace(' ', 'T');
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{1,2}):(\d{2})$/.exec(raw);
  if (!match) return null;
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5])
  );
  return Number.isNaN(date.getTime()) ? null : date;
};
const eventInputTextToIso = (value) => {
  const date = eventInputTextToDate(value);
  if (!date || Number.isNaN(date.getTime())) return '';
  return date.toISOString();
};
const eventInputTextToEndOfDayIso = (value) => {
  const date = eventInputTextToDate(value);
  if (!date || Number.isNaN(date.getTime())) return '';
  date.setHours(23, 59, 59, 999);
  return date.toISOString();
};
const formatEventDatePickerLabel = (value) => {
  const date = eventInputTextToDate(value);
  if (!date) return 'Datum wählen';
  return date.toLocaleDateString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
};
const formatEventTimePickerLabel = (value) => {
  const date = eventInputTextToDate(value);
  if (!date) return 'Uhrzeit wählen';
  return date.toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit'
  });
};
const formatEventOccurrenceAdminDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Termin';
  return date.toLocaleString('de-DE', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};
const mergeEventDateTimePart = (currentText, selectedDate, mode, fallbackDate = new Date()) => {
  const current = eventInputTextToDate(currentText) || fallbackDate;
  const next = new Date(current);
  if (mode === 'date') {
    next.setFullYear(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
  } else {
    next.setHours(selectedDate.getHours(), selectedDate.getMinutes(), 0, 0);
  }
  return toEventInputText(next);
};
const createDefaultEventDateRange = () => {
  const start = new Date();
  start.setSeconds(0, 0);
  start.setMinutes(start.getMinutes() < 30 ? 30 : 0);
  if (start.getMinutes() === 0) start.setHours(start.getHours() + 1);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  return {
    startAtText: toEventInputText(start),
    endAtText: toEventInputText(end)
  };
};
const formatEventAdditionalDateLabel = (value) => {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return 'Datum wählen';
  const date = new Date(`${text}T12:00:00`);
  if (Number.isNaN(date.getTime())) return 'Datum wählen';
  return date.toLocaleDateString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
};
const formatReviewDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};
const digitalCategories = ['Vegan', 'Vegetarisch', 'Normal', 'Getränke'];
const menuItemAllergenOptions = ['Gluten', 'Laktose', 'Ei', 'Nüsse', 'Senf'];
const digitalCategoryLabelByKey = {
  Vegan: 'Vegan',
  Vegetarisch: 'Vegetarisch',
  Normal: 'Fleischgerichte',
  Getränke: 'Getränke'
};
const digitalDietFilterOptions = [
  { key: 'all', label: 'Alle' },
  { key: 'vegan', label: 'Vegan' },
  { key: 'vegetarian', label: 'Vegetarisch' },
  { key: 'drinks', label: 'Getränke' }
];
const emptyDigitalMenuDraft = {
  items: [],
  allergens: [],
  duplicatesRemoved: 0,
  warnings: [],
  updatedAt: null,
  lunchValidity: null
};

const createLunchValidityEditorState = () => ({
  open: false,
  applyMode: 'save',
  fromDate: '',
  toDate: '',
  weekdays: [],
  suggestionType: 'none',
  detectedByAi: false,
  saveAfterApply: false,
  error: ''
});

const lunchWeekdayOptions = openingHourDays.map((day) => ({
  key: day.key,
  label: day.shortLabel,
  fullLabel: day.label
}));
const lunchWeekdayOrder = lunchWeekdayOptions.map((day) => day.key);
const lunchWeekdayShortLabelByKey = lunchWeekdayOptions.reduce((acc, day) => {
  acc[day.key] = day.label;
  return acc;
}, {});

const createDraftId = () => `menu-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const reservationEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeLunchMenuAvailableDates = (value) => {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value
    .map((entry) => String(entry || '').trim())
    .filter((entry) => specialClosureDatePattern.test(entry) && !seen.has(entry) && seen.add(entry))
    .sort((a, b) => a.localeCompare(b))
    .slice(0, 31);
};

const normalizeLunchMenuWeekdays = (value) => {
  if (!Array.isArray(value)) return [];
  return lunchWeekdayOrder.filter((dayKey) => value.includes(dayKey));
};

const normalizeLunchMenuWeekKey = (value) => {
  const text = String(value || '').trim();
  if (!isoWeekKeyPattern.test(text)) return null;
  return text;
};

const toDatePartsInRestaurantTimeZone = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: restaurantTimeZone,
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

const addDays = (date, days) => new Date(date.getTime() + days * 24 * 60 * 60 * 1000);

const getLunchWeekKeyOption = (weekOffset = 0) =>
  toIsoWeekKeyInRestaurantTimeZone(addDays(new Date(), weekOffset * 7));

const buildLunchWeekOptions = () => [
  {
    key: getLunchWeekKeyOption(0),
    label: 'Diese Woche',
    hint: 'Gilt nur in der aktuellen Kalenderwoche.'
  },
  {
    key: getLunchWeekKeyOption(1),
    label: 'Nächste Woche',
    hint: 'Gilt erst in der kommenden Kalenderwoche.'
  }
].filter((option) => option.key);

const getLunchWeekOptionLabel = (weekKey) => {
  const option = buildLunchWeekOptions().find((entry) => entry.key === weekKey);
  return option?.label || 'gewählte Woche';
};

const getLunchWeekOptionSentenceText = (weekKey) => {
  const label = getLunchWeekOptionLabel(weekKey);
  if (label === 'Diese Woche') return 'diese Woche';
  if (label === 'Nächste Woche') return 'nächste Woche';
  return 'die gewählte Woche';
};

const toLunchWeekdayKeyInRestaurantTimeZone = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: restaurantTimeZone,
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

const deriveLunchSchedule = (item, { allowPending = false } = {}) => {
  const legacyAvailableDates = normalizeLunchMenuAvailableDates(item?.availableDates);
  let availableWeekdays = normalizeLunchMenuWeekdays(item?.availableWeekdays);
  let repeatWeekly = item?.repeatWeekly === undefined ? true : Boolean(item.repeatWeekly);
  let activeWeekKey = normalizeLunchMenuWeekKey(item?.activeWeekKey);
  let schedulePending = allowPending && item?.schedulePending === true;
  let scheduleMode =
    item?.scheduleMode === 'dateRange' ||
    item?.scheduleMode === 'weekdays' ||
    item?.scheduleMode === 'openingHours'
      ? item.scheduleMode
      : null;
  let validFrom = specialClosureDatePattern.test(String(item?.validFrom || '')) ? item.validFrom : null;
  let validUntil = specialClosureDatePattern.test(String(item?.validUntil || '')) ? item.validUntil : null;

  if (validFrom && validUntil && validUntil < validFrom) validUntil = null;
  if (scheduleMode === 'dateRange' && !validFrom) scheduleMode = 'openingHours';
  if (scheduleMode === 'dateRange') {
    return {
      availableWeekdays: availableWeekdays.length ? availableWeekdays : [...lunchWeekdayOrder],
      repeatWeekly: false,
      activeWeekKey: null,
      schedulePending: false,
      scheduleMode,
      validFrom,
      validUntil
    };
  }
  if (scheduleMode === 'weekdays') {
    return {
      availableWeekdays: availableWeekdays.length ? availableWeekdays : [...lunchWeekdayOrder],
      repeatWeekly: true,
      activeWeekKey: null,
      schedulePending: false,
      scheduleMode,
      validFrom: null,
      validUntil: null
    };
  }
  if (scheduleMode === 'openingHours') {
    return {
      availableWeekdays: [],
      repeatWeekly: true,
      activeWeekKey: null,
      schedulePending: false,
      scheduleMode,
      validFrom: null,
      validUntil: null
    };
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

  if (availableWeekdays.length) {
    schedulePending = false;
  } else if (!schedulePending) {
    // Older menus without a schedule inherit the restaurant opening days.
    scheduleMode = 'openingHours';
  }

  if (schedulePending) {
    activeWeekKey = null;
  } else if (repeatWeekly) {
    activeWeekKey = null;
  } else if (!activeWeekKey) {
    activeWeekKey = getLunchWeekKeyOption(0);
  }

  return {
    availableWeekdays,
    repeatWeekly,
    activeWeekKey,
    schedulePending,
    scheduleMode,
    validFrom: null,
    validUntil: null
  };
};

const parseLunchIsoDate = (value) => {
  const text = String(value || '').trim();
  if (!specialClosureDatePattern.test(text)) return null;
  const date = new Date(`${text}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getLunchWeekdayKeyFromLocalDate = (date) => {
  const index = date instanceof Date ? date.getDay() : -1;
  return ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][index] || null;
};

const getIsoWeekMondayDate = (weekKey) => {
  const match = String(weekKey || '').match(/^(\d{4})-W(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const week = Number(match[2]);
  const januaryFourth = new Date(Date.UTC(year, 0, 4));
  const januaryFourthDay = januaryFourth.getUTCDay() || 7;
  const mondayUtc = new Date(januaryFourth);
  mondayUtc.setUTCDate(januaryFourth.getUTCDate() - januaryFourthDay + 1 + (week - 1) * 7);
  return new Date(
    mondayUtc.getUTCFullYear(),
    mondayUtc.getUTCMonth(),
    mondayUtc.getUTCDate(),
    12
  );
};

const getCurrentIsoWeekMondayDate = () => {
  const now = new Date();
  const day = now.getDay() || 7;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - day + 1, 12);
};

const buildLunchDateRangeFromSchedule = (item) => {
  const schedule = deriveLunchSchedule(item, { allowPending: true });
  if (schedule.scheduleMode === 'dateRange' && schedule.validFrom) {
    return {
      fromDate: schedule.validFrom,
      toDate: schedule.validUntil || ''
    };
  }
  const weekdays = normalizeLunchMenuWeekdays(schedule.availableWeekdays);
  const monday =
    (!schedule.repeatWeekly && getIsoWeekMondayDate(schedule.activeWeekKey)) ||
    getCurrentIsoWeekMondayDate();
  if (!weekdays.length) {
    return {
      fromDate: toIsoDateText(monday),
      toDate: toIsoDateText(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6, 12))
    };
  }
  const indexes = weekdays.map((weekday) => lunchWeekdayOrder.indexOf(weekday)).filter((index) => index >= 0);
  const firstIndex = Math.min(...indexes);
  const lastIndex = Math.max(...indexes);
  return {
    fromDate: toIsoDateText(
      new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + firstIndex, 12)
    ),
    toDate: toIsoDateText(
      new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + lastIndex, 12)
    )
  };
};

const buildLunchScheduleFromDateRange = (fromValue, toValue) => {
  const fromDate = parseLunchIsoDate(fromValue);
  const toDate = toValue ? parseLunchIsoDate(toValue) : null;
  if (!fromDate) {
    return { error: 'Bitte ein Von-Datum auswählen.' };
  }
  if (toValue && !toDate) {
    return { error: 'Bitte ein gültiges Bis-Datum auswählen oder „Ohne Ende“ verwenden.' };
  }
  if (toDate && toDate.getTime() < fromDate.getTime()) {
    return { error: 'Das Bis-Datum muss am oder nach dem Von-Datum liegen.' };
  }
  return {
    availableWeekdays: [...lunchWeekdayOrder],
    repeatWeekly: false,
    activeWeekKey: null,
    schedulePending: false,
    scheduleMode: 'dateRange',
    validFrom: toIsoDateText(fromDate),
    validUntil: toDate ? toIsoDateText(toDate) : null
  };
};

const formatCompactLunchDateRange = (fromValue, toValue) => {
  const fromDate = parseLunchIsoDate(fromValue);
  const toDate = parseLunchIsoDate(toValue);
  if (!fromDate || !toDate) return '';
  const sameYear = fromDate.getFullYear() === toDate.getFullYear();
  const fromText = fromDate.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    ...(sameYear ? {} : { year: 'numeric' })
  });
  const toText = toDate.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
  return `${fromText}–${toText}`;
};

const formatLunchWeekdaysText = (value) => {
  const days = normalizeLunchMenuWeekdays(value);
  if (!days.length) return '';
  return days.map((day) => lunchWeekdayShortLabelByKey[day] || day).join(', ');
};

const formatLunchScheduleText = (item) => {
  const schedule = deriveLunchSchedule(item, { allowPending: true });
  if (schedule.scheduleMode === 'openingHours') {
    return 'Kein Zeitraum festgelegt · reguläre Öffnungstage';
  }
  if (schedule.scheduleMode === 'dateRange') {
    if (!schedule.validFrom) return 'Kein Zeitraum festgelegt · reguläre Öffnungstage';
    const fromText = formatIsoDateLabel(schedule.validFrom);
    const untilText = schedule.validUntil ? formatIsoDateLabel(schedule.validUntil) : 'ohne Ende';
    return `${fromText}–${untilText}`;
  }
  if (schedule.scheduleMode === 'weekdays') {
    return `${formatLunchWeekdaysText(schedule.availableWeekdays)} · jede Woche`;
  }
  if (item?.schedulePending === true) return 'Kein Zeitraum festgelegt';
  const weekdaysText = formatLunchWeekdaysText(item?.availableWeekdays);
  if (!weekdaysText) return 'Kein Zeitraum festgelegt';
  if (item?.repeatWeekly !== false) return `${weekdaysText} · jede Woche`;
  const range = buildLunchDateRangeFromSchedule(item);
  const dateText = formatCompactLunchDateRange(range.fromDate, range.toDate);
  return `${dateText || weekdaysText} · nur diese Woche`;
};

const getLunchMenuValiditySummary = (items) => {
  const list = Array.isArray(items) ? items : [];
  const pendingCount = list.filter(
    (item) =>
      item?.schedulePending === true ||
      deriveLunchSchedule(item, { allowPending: true }).scheduleMode === 'openingHours'
  ).length;
  if (pendingCount > 0) {
    return {
      text: `${pendingCount} ${pendingCount === 1 ? 'Gericht' : 'Gerichte'} ohne Datum`,
      pendingCount,
      commonSchedule: null
    };
  }
  if (!list.length) {
    return { text: 'Noch keine Gerichte', pendingCount: 0, commonSchedule: null };
  }
  const schedules = list.map((item) => deriveLunchSchedule(item, { allowPending: true }));
  const signatures = schedules.map(
    (schedule) =>
      `${schedule.scheduleMode || 'legacy'}|${schedule.validFrom || ''}|${schedule.validUntil || ''}|${schedule.availableWeekdays.join(',')}|${schedule.repeatWeekly ? 'repeat' : schedule.activeWeekKey}`
  );
  if (!signatures.every((signature) => signature === signatures[0])) {
    return { text: 'Unterschiedliche Zeiträume', pendingCount: 0, commonSchedule: null };
  }
  return {
    text: formatLunchScheduleText(schedules[0]),
    pendingCount: 0,
    commonSchedule: schedules[0]
  };
};

const normalizeReservationMode = (value, legacyEnabled = false) => {
  const text = String(value || '').trim().toLowerCase();
  if (reservationModeOptions.some((option) => option.key === text)) {
    return text;
  }
  return legacyEnabled ? 'app' : 'disabled';
};

const isReservationModeEnabled = (mode) => mode === 'app' || mode === 'external';

const normalizeReservationExternalLinkValue = (value) => {
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

const normalizeReservationExternalEmailValue = (value) => {
  const text = String(value || '').trim().toLowerCase();
  if (!text || !reservationEmailPattern.test(text)) return '';
  return text;
};

const normalizeReservationExternalPhoneValue = (value) => {
  const text = String(value || '').trim();
  if (!text || text.length < 6) return '';
  return text;
};

const normalizePriceInput = (value) => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Number(value.toFixed(2));
  }

  const text = String(value || '').trim();
  if (!text) return null;
  let normalized = text
    .replace(/[€\s]/g, '')
    .replace(/,-/g, '')
    .replace(/,--/g, '');

  if (normalized.includes(',') && normalized.includes('.')) {
    if (normalized.lastIndexOf(',') > normalized.lastIndexOf('.')) {
      normalized = normalized.replace(/\./g, '').replace(/,/g, '.');
    } else {
      normalized = normalized.replace(/,/g, '');
    }
  } else if (normalized.includes(',')) {
    normalized = normalized.replace(/,/g, '.');
  }

  const match = normalized.match(/\d+(?:\.\d{1,2})?/);
  if (!match) return null;
  const number = Number(match[0]);
  if (!Number.isFinite(number) || number <= 0) return null;
  return Number(number.toFixed(2));
};

const toDigitalMenuDetectionText = (...values) =>
  values
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss');

const digitalMenuDrinkPatterns = [
  /\bgetranke?\b/,
  /\bdrinks?\b/,
  /\bbeverages?\b/,
  /\bsoftdrinks?\b/,
  /\bmilchkaffee\b/,
  /\bkaffee\b/,
  /\bcoffee\b/,
  /\bespresso\b/,
  /\bkakao\b/,
  /\bcappuccino\b/,
  /\bcortado\b/,
  /\bflat\s*white\b/,
  /\blatte\b/,
  /\bmacchiato\b/,
  /\bmatcha\b/,
  /tee\b/,
  /\btea\b/,
  /\beistee\b/,
  /\bheisse?\s+zitrone\b/,
  /\bheisser?\s+ingwer\b/,
  /\bzitrone\s*(?:&|und)\s*ingwer\b/,
  /wasser/,
  /\bviva\s+con\s+aqua\b/,
  /\baqua\b/,
  /\bcola\b/,
  /\bfanta\b/,
  /\bsprite\b/,
  /\blimonade\b/,
  /\blimos?\b/,
  /\bsaft\b/,
  /schorle/,
  /\bbier\b/,
  /\bmate\b/,
  /\bcharitea\b/,
  /\brosewein\b/,
  /\bwein\b/,
  /\bprosecco\b/,
  /\bcocktails?\b/,
  /\blongdrinks?\b/,
  /\bsmoothie\b/,
  /\bingwershot\b/,
  /\b(?:espresso|matcha|sirup)\s*shot\b/
];

const digitalMenuFoodPatterns = [
  /\bfruhstuck\b/,
  /\bbowls?\b/,
  /\blunch\s*bowls?\b/,
  /\bkuchen\b/,
  /\bmusli\b/,
  /\bbrot\b/,
  /\bcroissants?\b/,
  /\bsalate?\b/,
  /\bsalat\b/,
  /\bsuppen?\b/,
  /\bpasta\b/,
  /\bnudeln?\b/,
  /\bsandwich(?:es)?\b/,
  /\bstullen?\b/,
  /\bsnacks?\b/
];

const isDigitalMenuDrinkText = (...values) => {
  const text = toDigitalMenuDetectionText(...values);
  return Boolean(text && digitalMenuDrinkPatterns.some((pattern) => pattern.test(text)));
};

const isDigitalMenuFoodText = (...values) => {
  const text = toDigitalMenuDetectionText(...values);
  return Boolean(text && digitalMenuFoodPatterns.some((pattern) => pattern.test(text)));
};

const normalizeDraftCategory = (...values) => {
  const normalized = toDigitalMenuDetectionText(...values);
  const [, section, name] = values;
  const foodIdentity =
    isDigitalMenuFoodText(name) || (isDigitalMenuFoodText(section) && !isDigitalMenuDrinkText(name));
  if (foodIdentity) {
    if (normalized.includes('vegan')) return 'Vegan';
    if (normalized.includes('vegetar')) return 'Vegetarisch';
    return 'Normal';
  }
  if (isDigitalMenuDrinkText(values[0], section, name)) return 'Getränke';
  if (normalized.includes('vegan')) return 'Vegan';
  if (normalized.includes('vegetar')) return 'Vegetarisch';
  return 'Normal';
};

const normalizeOfferType = (value) => {
  const text = String(value || '').trim().toLowerCase();
  if (text === 'icecream') return 'icecream';
  if (text === 'coffee') return 'coffee';
  return 'normal';
};

const inferOfferTypeFromTags = (tags) => {
  if (!Array.isArray(tags)) return 'normal';
  if (tags.includes('icecream')) return 'icecream';
  if (tags.includes('coffee')) return 'coffee';
  return 'normal';
};

const getOfferTypeLabelFromTags = (tags) => offerTypeLabelByKey[inferOfferTypeFromTags(tags)] || 'Gericht';

const inferOfferTypeFromText = (name, description) => {
  const text = `${String(name || '')} ${String(description || '')}`.toLowerCase();
  const icePattern = /\b(eis|gelato|sorbet|sundae)\b/;
  if (icePattern.test(text)) return 'icecream';
  const coffeePattern = /\b(kaffee|cafe|espresso|latte|cappuccino|macchiato|americano|mocha)\b/;
  if (coffeePattern.test(text)) return 'coffee';
  return 'normal';
};

const ensureOfferTypeTag = (tags, offerType) => {
  const base = Array.isArray(tags)
    ? tags.filter((tag) => tag && tag !== 'classic' && tag !== 'icecream' && tag !== 'coffee')
    : [];
  const resolvedType = normalizeOfferType(offerType);
  if (resolvedType === 'icecream') return [...base, 'icecream'];
  if (resolvedType === 'coffee') return [...base, 'coffee'];
  return base.length ? base : ['classic'];
};

const normalizeAllergenList = (value) => {
  let list = [];
  if (Array.isArray(value)) {
    list = value;
  } else if (typeof value === 'string') {
    list = value.split(/\r?\n|;|,/);
  }

  const seen = new Set();
  const normalized = [];
  list.forEach((entry) => {
    const text = String(entry || '')
      .trim()
      .replace(/^[\-•\d\)\.\s]+/, '')
      .replace(/\s+/g, ' ');
    if (!text) return;
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    normalized.push(text);
  });
  return normalized.slice(0, 60);
};

const toDigitalCategoryLabel = (value) =>
  digitalCategoryLabelByKey[normalizeDraftCategory(value)] || 'Fleischgerichte';

const normalizeDigitalSectionTitle = (value, category = 'Normal') => {
  const normalizedCategory = normalizeDraftCategory(category);
  const text = String(value || '')
    .trim()
    .replace(/\s+/g, ' ');
  if (text) {
    if (normalizedCategory === 'Getränke' && !isDigitalMenuDrinkText(text)) {
      return toDigitalCategoryLabel(normalizedCategory);
    }
    return text.slice(0, 120);
  }
  return toDigitalCategoryLabel(normalizedCategory);
};

const detectMenuSectionTone = (value) => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (!normalized) return 'Default';
  if (/kids|kinder/.test(normalized)) return 'Kids';
  if (/lunch|mittag/.test(normalized)) return 'Lunch';
  if (/dinner|abend|hauptkarte/.test(normalized)) return 'Dinner';
  if (/breakfast|früh|frueh/.test(normalized)) return 'Breakfast';
  if (/dessert|nachtisch|süß|suss|kuchen|kaffee|coffee|eis|ice/.test(normalized)) return 'Dessert';
  if (/salat|salad|suppe|soup/.test(normalized)) return 'Salad';
  return 'Default';
};

const normalizeCuisineType = (value) => {
  const text = String(value || '').trim();
  if (!text) return '';
  return cuisineTypeAliasMap[text] || text;
};

const toPriceText = (value) => {
  const parsed = normalizePriceInput(value);
  return parsed === null ? '' : parsed.toFixed(2).replace('.', ',');
};

const normalizeDraftItem = (item, { lunchMode = false } = {}) => {
  const name = String(item?.name || item?.title || '').trim();
  if (!name) return null;
  const parsedPrice = normalizePriceInput(item?.price ?? item?.priceText);
  if (parsedPrice === null) return null;
  const category = normalizeDraftCategory(
    item?.category,
    item?.section ?? item?.group ?? item?.heading ?? item?.sectionName,
    name,
    item?.description
  );
  const allergens = normalizeAllergenList(item?.allergens).slice(0, 20);
  const hasLunchDays = normalizeLunchMenuWeekdays(item?.availableWeekdays).length > 0;
  const hasLegacyLunchDates = normalizeLunchMenuAvailableDates(item?.availableDates).length > 0;
  const schedulePending =
    lunchMode &&
    (item?.schedulePending === true || (!hasLunchDays && !hasLegacyLunchDates));
  const schedule = deriveLunchSchedule(
    {
      ...item,
      schedulePending
    },
    { allowPending: lunchMode }
  );
  return {
    id: String(item?.id || createDraftId()),
    name,
    description: String(item?.description || '').trim(),
    priceText: parsedPrice.toFixed(2).replace('.', ','),
    category,
    section: normalizeDigitalSectionTitle(
      item?.section ?? item?.group ?? item?.heading ?? item?.sectionName,
      category
    ),
    allergens,
    availableWeekdays: schedule.availableWeekdays,
    repeatWeekly: schedule.repeatWeekly,
    activeWeekKey: schedule.activeWeekKey,
    schedulePending: schedule.schedulePending,
    scheduleMode: schedule.scheduleMode,
    validFrom: schedule.validFrom,
    validUntil: schedule.validUntil,
    active: item?.active === undefined ? true : Boolean(item.active)
  };
};

const normalizeLunchValiditySuggestion = (value) => {
  const type = value?.type;
  const validFrom = specialClosureDatePattern.test(String(value?.validFrom || '')) ? value.validFrom : null;
  const validUntil = specialClosureDatePattern.test(String(value?.validUntil || '')) ? value.validUntil : null;
  const weekdays = normalizeLunchMenuWeekdays(value?.weekdays);
  if (type === 'dateRange' && validFrom && (!validUntil || validUntil >= validFrom)) {
    return { type: 'dateRange', validFrom, validUntil, weekdays: [] };
  }
  if (type === 'weekdays' && weekdays.length) {
    return { type: 'weekdays', validFrom: null, validUntil: null, weekdays };
  }
  return { type: 'none', validFrom: null, validUntil: null, weekdays: [] };
};

const applyLunchValiditySuggestion = (draft, rawSuggestion) => {
  const suggestion = normalizeLunchValiditySuggestion(rawSuggestion);
  const schedule =
    suggestion.type === 'dateRange'
      ? {
          scheduleMode: 'dateRange',
          validFrom: suggestion.validFrom,
          validUntil: suggestion.validUntil,
          availableWeekdays: [...lunchWeekdayOrder],
          repeatWeekly: false,
          activeWeekKey: null,
          schedulePending: false
        }
      : suggestion.type === 'weekdays'
      ? {
          scheduleMode: 'weekdays',
          validFrom: null,
          validUntil: null,
          availableWeekdays: suggestion.weekdays,
          repeatWeekly: true,
          activeWeekKey: null,
          schedulePending: false
        }
      : {
          scheduleMode: 'openingHours',
          validFrom: null,
          validUntil: null,
          availableWeekdays: [],
          repeatWeekly: true,
          activeWeekKey: null,
          schedulePending: false
        };
  return {
    ...draft,
    lunchValidity: suggestion,
    items: (draft?.items || []).map((item) => ({ ...item, ...schedule }))
  };
};

const buildDigitalMenuDraft = (payload, { lunchMode = false } = {}) => {
  const allergens = normalizeAllergenList(payload?.menu?.allergens ?? payload?.allergens);
  const directItemsSource = Array.isArray(payload?.menu?.items)
    ? payload.menu.items
    : Array.isArray(payload?.items)
    ? payload.items
    : null;

  if (directItemsSource) {
    return {
      items: directItemsSource.map((item) => normalizeDraftItem(item, { lunchMode })).filter(Boolean),
      allergens,
      duplicatesRemoved: Number(payload?.duplicatesRemoved || 0),
      warnings: Array.isArray(payload?.warnings) ? payload.warnings.filter(Boolean) : [],
      updatedAt: payload?.updatedAt || null,
      lunchValidity: lunchMode ? normalizeLunchValiditySuggestion(payload?.lunchValidity) : null
    };
  }

  const sectionsSource = Array.isArray(payload?.menu?.sections)
    ? payload.menu.sections
    : Array.isArray(payload?.sections)
    ? payload.sections
    : [];

  const items = sectionsSource
    .flatMap((section, sectionIndex) => {
      const sectionName = String(section?.name || '').trim() || `Menü ${sectionIndex + 1}`;
      const itemsSource = Array.isArray(section?.items) ? section.items : [];
      return itemsSource
        .map((item) => normalizeDraftItem(item, { lunchMode }))
        .filter(Boolean)
        .map((entry) => {
          const sectionTitle = normalizeDigitalSectionTitle(sectionName, entry.category);
          if (entry.category !== 'Normal') {
            return {
              ...entry,
              section: normalizeDigitalSectionTitle(entry.section || sectionTitle, entry.category)
            };
          }
          return {
            ...entry,
            category: normalizeDraftCategory(entry.category, sectionName, entry.name, entry.description),
            section: sectionTitle
          };
        });
    })
    .filter(Boolean);

  return {
    items,
    allergens,
    duplicatesRemoved: Number(payload?.duplicatesRemoved || 0),
    warnings: Array.isArray(payload?.warnings) ? payload.warnings.filter(Boolean) : [],
    updatedAt: payload?.updatedAt || null,
    lunchValidity: lunchMode ? normalizeLunchValiditySuggestion(payload?.lunchValidity) : null
  };
};

const toDigitalDraftDedupeKey = (item) => {
  const normalized = normalizeDraftItem(item);
  if (!normalized) return '';
  const price = normalizePriceInput(normalized.priceText);
  if (price === null) return '';
  return [
    normalized.name.toLowerCase(),
    price.toFixed(2),
    normalized.category,
    normalized.section.toLowerCase()
  ].join('|');
};

const mergeDigitalMenuDrafts = (currentDraft, incomingDraft, { lunchMode = false } = {}) => {
  const currentItems = Array.isArray(currentDraft?.items)
    ? currentDraft.items.map((item) => normalizeDraftItem(item, { lunchMode })).filter(Boolean)
    : [];
  const incomingItems = Array.isArray(incomingDraft?.items)
    ? incomingDraft.items.map((item) => normalizeDraftItem(item, { lunchMode })).filter(Boolean)
    : [];

  const mergedItems = [...currentItems];
  const seen = new Set();
  currentItems.forEach((item) => {
    const key = toDigitalDraftDedupeKey(item);
    if (key) seen.add(key);
  });

  let skippedDuplicates = 0;
  incomingItems.forEach((item) => {
    const key = toDigitalDraftDedupeKey(item);
    if (key && seen.has(key)) {
      if (key) {
        const existingIndex = mergedItems.findIndex(
          (entry) => toDigitalDraftDedupeKey(entry) === key
        );
        if (existingIndex >= 0) {
          mergedItems[existingIndex] = {
            ...mergedItems[existingIndex],
            active:
              mergedItems[existingIndex]?.active === false && item?.active === false ? false : true
          };
        }
      }
      skippedDuplicates += 1;
      return;
    }
    if (key) seen.add(key);
    mergedItems.push(item);
  });

  const warnings = Array.isArray(incomingDraft?.warnings)
    ? incomingDraft.warnings.filter(Boolean)
    : [];
  if (skippedDuplicates > 0) {
    warnings.push(
      `${skippedDuplicates} bereits vorhandene Gerichte wurden beim Ergänzen nicht erneut hinzugefügt.`
    );
  }

  return {
    items: mergedItems,
    allergens: normalizeAllergenList([
      ...(Array.isArray(currentDraft?.allergens) ? currentDraft.allergens : []),
      ...(Array.isArray(incomingDraft?.allergens) ? incomingDraft.allergens : [])
    ]),
    duplicatesRemoved: Number(incomingDraft?.duplicatesRemoved || 0) + skippedDuplicates,
    warnings,
    updatedAt: incomingDraft?.updatedAt || currentDraft?.updatedAt || null,
    lunchValidity: lunchMode
      ? normalizeLunchValiditySuggestion(incomingDraft?.lunchValidity || currentDraft?.lunchValidity)
      : null
  };
};

const toOfferMatchKey = (name, price) => {
  const normalizedName = String(name || '').trim().toLowerCase();
  const normalizedPrice = normalizePriceInput(price);
  if (!normalizedName || normalizedPrice === null) return '';
  return `${normalizedName}|${normalizedPrice.toFixed(2)}`;
};

const tagsForDigitalCategory = (category) => {
  const normalized = normalizeDraftCategory(category);
  if (normalized === 'Vegan') return ['vegan'];
  if (normalized === 'Vegetarisch') return ['vegetarian'];
  return ['classic'];
};

const MenuCategoryBadge = ({ category }) => {
  const normalized = normalizeDraftCategory(category);
  if (normalized === 'Normal') return null;
  return (
    <View
      style={[
        styles.menuDietBadge,
        normalized === 'Vegan'
          ? styles.menuDietBadgeVegan
          : normalized === 'Getränke'
          ? styles.menuDietBadgeDrinks
          : styles.menuDietBadgeVegetarian
      ]}
    >
      <Text style={styles.menuDietBadgeText}>{normalized}</Text>
    </View>
  );
};

const MealSlotChip = ({ label, active, onPress, compact = false, tiny = false, disabled = false }) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    style={({ pressed }) => [
      styles.mealSlotChip,
      compact && styles.mealSlotChipCompact,
      tiny && styles.mealSlotChipTiny,
      active && styles.mealSlotChipActive,
      disabled && styles.mealSlotChipDisabled,
      pressed && styles.iconPressed
    ]}
  >
    <Text
      style={[
        styles.mealSlotChipText,
        compact && styles.mealSlotChipTextCompact,
        tiny && styles.mealSlotChipTextTiny,
        active && styles.mealSlotChipTextActive,
        disabled && styles.mealSlotChipTextDisabled
      ]}
    >
      {label}
    </Text>
  </Pressable>
);

const ToggleSwitch = ({ label, value, onPress, compact = false, disabled = false }) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    style={[
      styles.toggleRow,
      compact && styles.toggleRowCompact,
      disabled && styles.toggleRowDisabled
    ]}
  >
    <Text style={[styles.toggleLabel, compact && styles.toggleLabelCompact]}>{label}</Text>
    <View
      style={[
        styles.toggleTrack,
        value && styles.toggleTrackOn,
        disabled && styles.toggleTrackDisabled
      ]}
    >
      <View style={[styles.toggleThumb, value && styles.toggleThumbOn]} />
    </View>
  </Pressable>
);

const RestaurantScreen = ({ onBack }) => {
  const {
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
    loadRestaurantOrders,
    loadRestaurantReservations,
    loadRestaurantReviews,
    requestRestaurantPasswordReset,
    confirmRestaurantPasswordReset,
    changeRestaurantPassword,
    logout
  } = useOffers();

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [visiblePasswordFields, setVisiblePasswordFields] = useState({});
  const [rememberMe, setRememberMe] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState('');
  const [resetCodeSent, setResetCodeSent] = useState(false);

  const [registerName, setRegisterName] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerPhone, setRegisterPhone] = useState('');
  const [registerAddress, setRegisterAddress] = useState('');
  const [registerCity, setRegisterCity] = useState('');
  const [registerPostal, setRegisterPostal] = useState('');
  const [registerStreetSuggestions, setRegisterStreetSuggestions] = useState([]);
  const [registerStreetLookupLoading, setRegisterStreetLookupLoading] = useState(false);
  const [registerStreetLookupError, setRegisterStreetLookupError] = useState('');
  const [registerCitySuggestions, setRegisterCitySuggestions] = useState([]);
  const [registerCityLookupLoading, setRegisterCityLookupLoading] = useState(false);
  const [registerCityLookupError, setRegisterCityLookupError] = useState('');
  const [registerLogoUri, setRegisterLogoUri] = useState(null);
  const [registerProviderScopes, setRegisterProviderScopes] = useState(['food']);
  const [registerTermsAccepted, setRegisterTermsAccepted] = useState(false);
  const [registerPrivacyAccepted, setRegisterPrivacyAccepted] = useState(false);

  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [offerMealSlot, setOfferMealSlot] = useState(DEFAULT_MEAL_SLOT);
  const [offerType, setOfferType] = useState('normal');
  const [isVegan, setIsVegan] = useState(false);
  const [isVegetarian, setIsVegetarian] = useState(false);
  const [imageUri, setImageUri] = useState(null);
  const [imageAsset, setImageAsset] = useState(null);
  const [preorderEnabled, setPreorderEnabled] = useState(false);
  const [editingOffer, setEditingOffer] = useState(null);
  const [profileMealSlots, setProfileMealSlots] = useState([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsPage, setSettingsPage] = useState('root');
  const [settingsServicesTab, setSettingsServicesTab] = useState('events');
  const [settingsServicesDirty, setSettingsServicesDirty] = useState(false);
  const [settingsFeedback, setSettingsFeedback] = useState('');
  const [settingsCurrentPassword, setSettingsCurrentPassword] = useState('');
  const [settingsNewPassword, setSettingsNewPassword] = useState('');
  const [settingsNewPasswordConfirm, setSettingsNewPasswordConfirm] = useState('');
  const [settingsName, setSettingsName] = useState('');
  const [settingsEmail, setSettingsEmail] = useState('');
  const [settingsPhone, setSettingsPhone] = useState('');
  const [settingsAddress, setSettingsAddress] = useState('');
  const [settingsPostalCode, setSettingsPostalCode] = useState('');
  const [settingsMealSlots, setSettingsMealSlots] = useState([]);
  const [settingsReservationMode, setSettingsReservationMode] = useState('disabled');
  const [settingsReservationExternalLink, setSettingsReservationExternalLink] = useState('');
  const [settingsReservationExternalEmail, setSettingsReservationExternalEmail] = useState('');
  const [settingsReservationExternalPhone, setSettingsReservationExternalPhone] = useState('');
  const [settingsCuisineTypes, setSettingsCuisineTypes] = useState([]);
  const [settingsOpeningHours, setSettingsOpeningHours] = useState(() => createDefaultOpeningHours());
  const [settingsSpecialClosures, setSettingsSpecialClosures] = useState([]);
  const [settingsSpecialClosureDate, setSettingsSpecialClosureDate] = useState('');
  const [settingsSpecialClosureReason, setSettingsSpecialClosureReason] = useState('');
  const [settingsSpecialClosurePickerOpen, setSettingsSpecialClosurePickerOpen] = useState(false);
  const [settingsLogoUri, setSettingsLogoUri] = useState('');
  const [settingsLogoUploading, setSettingsLogoUploading] = useState(false);
  const [settingsSocialLinks, setSettingsSocialLinks] = useState(() => [{ ...emptySocialLink }]);
  const [settingsProviderScopes, setSettingsProviderScopes] = useState(['food']);
  const [settingsEventOfferingsText, setSettingsEventOfferingsText] = useState('');
  const [settingsEventReservationUrl, setSettingsEventReservationUrl] = useState('');
  const [settingsEventContactUrl, setSettingsEventContactUrl] = useState('');
  const [settingsEventContactEmail, setSettingsEventContactEmail] = useState('');
  const [settingsEventContactPhone, setSettingsEventContactPhone] = useState('');
  const [settingsCateringOfferingsText, setSettingsCateringOfferingsText] = useState('');
  const [settingsCateringContactUrl, setSettingsCateringContactUrl] = useState('');
  const [settingsCateringContactEmail, setSettingsCateringContactEmail] = useState('');
  const [settingsCateringContactPhone, setSettingsCateringContactPhone] = useState('');
  const [timePickerState, setTimePickerState] = useState({
    visible: false,
    dayKey: null,
    periodIndex: 0,
    field: 'openTime',
    value: DEFAULT_OPEN_TIME
  });
  const [settingsAboutText, setSettingsAboutText] = useState('');
  const [settingsWebsiteSyncUrl, setSettingsWebsiteSyncUrl] = useState('');
  const [websiteSyncOpen, setWebsiteSyncOpen] = useState(false);
  const [websiteSyncUrl, setWebsiteSyncUrl] = useState('');
  const [websiteSyncDraft, setWebsiteSyncDraft] = useState(null);
  const [websiteSyncError, setWebsiteSyncError] = useState('');
  const [websiteSyncApplying, setWebsiteSyncApplying] = useState('');
  const [websiteSyncSelectedItems, setWebsiteSyncSelectedItems] = useState({});
  const [websiteSyncPriceOverrides, setWebsiteSyncPriceOverrides] = useState({});
  const [websiteSyncPreviewArea, setWebsiteSyncPreviewArea] = useState(null);
  const [authMode, setAuthMode] = useState('login');
  const [status, setStatus] = useState('');
  const [digitalMenuDraft, setDigitalMenuDraft] = useState({ ...emptyDigitalMenuDraft });
  const [digitalMenuDirty, setDigitalMenuDirty] = useState(false);
  const [digitalMenuDietFilter, setDigitalMenuDietFilter] = useState('all');
  const [digitalMenuAllergensText, setDigitalMenuAllergensText] = useState('');
  const [digitalMenuStatus, setDigitalMenuStatus] = useState('');
  const [digitalMenuError, setDigitalMenuError] = useState('');
  const [digitalMenuLoading, setDigitalMenuLoading] = useState(false);
  const [digitalMenuSaving, setDigitalMenuSaving] = useState(false);
  const [lunchMenuDraft, setLunchMenuDraft] = useState({ ...emptyDigitalMenuDraft });
  const [lunchMenuDirty, setLunchMenuDirty] = useState(false);
  const [lunchMenuDietFilter, setLunchMenuDietFilter] = useState('all');
  const [lunchMenuAllergensText, setLunchMenuAllergensText] = useState('');
  const [lunchMenuStatus, setLunchMenuStatus] = useState('');
  const [lunchMenuError, setLunchMenuError] = useState('');
  const [lunchMenuLoading, setLunchMenuLoading] = useState(false);
  const [lunchMenuSaving, setLunchMenuSaving] = useState(false);
  const [lunchValidityEditor, setLunchValidityEditor] = useState(createLunchValidityEditorState);
  const [lunchValidityReviewRequired, setLunchValidityReviewRequired] = useState(false);
  const [lunchDatePickerState, setLunchDatePickerState] = useState({
    visible: false,
    target: 'bulk',
    field: 'fromDate',
    value: new Date()
  });
  const [menuItemEditorOpen, setMenuItemEditorOpen] = useState(false);
  const [menuItemEditorKind, setMenuItemEditorKind] = useState('normal');
  const [menuItemEditor, setMenuItemEditor] = useState({
    id: null,
    name: '',
    description: '',
    priceText: '',
    category: 'Normal',
    sectionTitle: 'Fleischgerichte',
    allergensText: '',
    availableWeekdays: [...lunchWeekdayOrder],
    repeatWeekly: true,
    activeWeekKey: null,
    schedulePending: false,
    scheduleMode: 'weekdays',
    validFrom: null,
    validUntil: null,
    validityFromDate: '',
    validityToDate: '',
    active: true
  });
  const [menuItemOfferMealSlot, setMenuItemOfferMealSlot] = useState(DEFAULT_MEAL_SLOT);
  const [menuItemOfferPreorderEnabled, setMenuItemOfferPreorderEnabled] = useState(false);
  const [menuItemOfferModalOpen, setMenuItemOfferModalOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [supportMode, setSupportMode] = useState('start');
  const [supportChatMessages, setSupportChatMessages] = useState([]);
  const [supportChatInput, setSupportChatInput] = useState('');
  const [supportChatLoading, setSupportChatLoading] = useState(false);
  const [supportChatSending, setSupportChatSending] = useState(false);
  const [supportChatError, setSupportChatError] = useState('');
  const [guideSupportMessage, setGuideSupportMessage] = useState('');
  const [guideSupportStatus, setGuideSupportStatus] = useState('');
  const [guideSupportError, setGuideSupportError] = useState('');
  const [guideSupportSending, setGuideSupportSending] = useState(false);
  const [onboardingAssistantOpen, setOnboardingAssistantOpen] = useState(false);
  const [onboardingStepIndex, setOnboardingStepIndex] = useState(0);
  const [onboardingStatus, setOnboardingStatus] = useState('');
  const [onboardingError, setOnboardingError] = useState('');
  const [onboardingReservationChoiceMade, setOnboardingReservationChoiceMade] = useState(false);
  const [onboardingRegularMenuOpen, setOnboardingRegularMenuOpen] = useState(false);
  const [onboardingLunchMenuOpen, setOnboardingLunchMenuOpen] = useState(false);
  const [activePanel, setActivePanel] = useState(null);
  const [requestsTab, setRequestsTab] = useState('orders');
  const [menuWorkspace, setMenuWorkspace] = useState(null);
  const [menuAnalytics, setMenuAnalytics] = useState(null);
  const [menuAnalyticsError, setMenuAnalyticsError] = useState('');
  const [menuAnalyticsKind, setMenuAnalyticsKind] = useState('regular');
  const [menuAnalyticsOpen, setMenuAnalyticsOpen] = useState(false);
  const [menuAnalyticsRange, setMenuAnalyticsRange] = useState(createMenuAnalyticsRange);
  const [menuAnalyticsDatePickerState, setMenuAnalyticsDatePickerState] = useState({
    visible: false,
    field: 'from',
    value: new Date()
  });
  const [offersCreateOpen, setOffersCreateOpen] = useState(false);
  const [offersListOpen, setOffersListOpen] = useState(false);
  const [highlightedReviewId, setHighlightedReviewId] = useState('');
  const [reviewReplyDrafts, setReviewReplyDrafts] = useState({});
  const [reviewReportTarget, setReviewReportTarget] = useState(null);
  const [reviewReportReason, setReviewReportReason] = useState('');
  const [reviewReportNote, setReviewReportNote] = useState('');
  const [reviewReportError, setReviewReportError] = useState('');
  const [reviewReportSending, setReviewReportSending] = useState(false);
  const [eventForm, setEventForm] = useState({ ...emptyEventForm });
  const [eventFormOpen, setEventFormOpen] = useState(false);
  const [eventDateTimePickerState, setEventDateTimePickerState] = useState({
    visible: false,
    field: 'startAtText',
    additionalIndex: null,
    additionalField: null,
    mode: 'date',
    value: new Date()
  });
  const [eventStatus, setEventStatus] = useState('');
  const [eventError, setEventError] = useState('');
  const [eventSocialLinksOpen, setEventSocialLinksOpen] = useState(false);
  const [eventOccurrenceOpenIds, setEventOccurrenceOpenIds] = useState([]);
  const [eventCancellationReasonDrafts, setEventCancellationReasonDrafts] = useState({});
  const [servicesDashboardTab, setServicesDashboardTab] = useState('events');
  const [cateringOfferFormOpen, setCateringOfferFormOpen] = useState(false);
  const [editingCateringOffer, setEditingCateringOffer] = useState(null);
  const [cateringOfferTitle, setCateringOfferTitle] = useState('');
  const [cateringOfferDescription, setCateringOfferDescription] = useState('');
  const [cateringOfferPrice, setCateringOfferPrice] = useState('');
  const [cateringOfferImages, setCateringOfferImages] = useState([]);
  const [cateringOfferStatus, setCateringOfferStatus] = useState('');
  const [menuPdfToolsOpen, setMenuPdfToolsOpen] = useState(false);
  const [menuKiToolsOpen, setMenuKiToolsOpen] = useState(false);
  const [lunchMenuToolsOpen, setLunchMenuToolsOpen] = useState(false);
  const [menuAddSheet, setMenuAddSheet] = useState({ visible: false, kind: 'normal', step: 'method', importMode: 'replace' });
  const [menuPickerInProgress, setMenuPickerInProgress] = useState(false);
  const [menuUnsavedTarget, setMenuUnsavedTarget] = useState(null);
  const [menuDeleteConfirmKind, setMenuDeleteConfirmKind] = useState(null);
  const [menuUndo, setMenuUndo] = useState(null);
  const scrollRef = useRef(null);
  const supportChatScrollRef = useRef(null);
  const openingTimePickerScrollRef = useRef(null);
  const menuUndoTimerRef = useRef(null);
  const menuPickerInProgressRef = useRef(false);
  const onboardingHintHandledRef = useRef(false);
  const eventFormYRef = useRef(0);
  const eventFormScrollPendingRef = useRef(false);
  const regularMenuContentYRef = useRef(0);
  const lunchMenuContentYRef = useRef(0);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isCompactLayout = windowWidth < 760;
  const isSmallPhone = windowWidth <= 375;
  const isNativeIos = Platform.OS === 'ios';
  const topSafeOffset = isNativeIos ? Math.max(insets.top + 8, 24) : 0;
  const guideFullscreenMobile = isCompactLayout;
  const settingsModalMaxHeight = Math.max(320, windowHeight - (isSmallPhone ? 8 : 32));
  const guideModalMaxHeight = Math.max(420, windowHeight - (isCompactLayout ? 20 : 56));
  const restaurantTopOffsetStyle = restaurant
    ? {
        paddingTop:
          (isSmallPhone ? spacing.sm : isCompactLayout ? spacing.md : spacing.lg) + topSafeOffset
      }
    : null;
  const modalTopOffsetStyle = isNativeIos
    ? {
        paddingTop:
          (isSmallPhone ? spacing.sm : isCompactLayout ? spacing.md : spacing.lg) + topSafeOffset
      }
    : null;
  const guideFullscreenSizeStyle =
    guideFullscreenMobile && Platform.OS === 'web'
      ? { height: '100dvh', maxHeight: '100dvh' }
      : { maxHeight: guideFullscreenMobile ? windowHeight : guideModalMaxHeight };
  const settingsModalSizeStyle =
    isSmallPhone && Platform.OS === 'web'
      ? { height: '100dvh', maxHeight: '100dvh' }
      : { maxHeight: settingsModalMaxHeight };
  const specialClosureDateOptions = useMemo(() => buildSpecialClosureDateOptions(), []);
  const lunchValidityDateOptions = useMemo(() => buildLunchValidityDateOptions(), []);

  const headerSubtitle = useMemo(() => {
    if (restaurant) {
      return `Hallo ${restaurant.name}`;
    }
    return 'Partner-Login oder neu registrieren.';
  }, [restaurant]);

  const normalizeMealSlots = (slots) => {
    return Array.from(
      new Set((slots || []).filter((slot) => mealSlotOptions.some((option) => option.key === slot)))
    );
  };

  const toEditableMealSlots = (slots) => {
    return normalizeMealSlots(slots);
  };

  const toggleMealSlot = (currentSlots, slot) => {
    if (currentSlots.includes(slot)) {
      return currentSlots.filter((value) => value !== slot);
    }
    return [...currentSlots, slot];
  };

  const normalizeCuisineTypes = (types) => {
    if (!Array.isArray(types)) return [];
    return Array.from(
      new Set(
        types
          .map((entry) => normalizeCuisineType(entry))
          .filter((entry) => entry.length >= 2)
      )
    );
  };

  const toggleCuisineType = (entry) => {
    setSettingsCuisineTypes((prev) => {
      const current = normalizeCuisineTypes(prev);
      if (current.includes(entry)) {
        return current.filter((item) => item !== entry);
      }
      return [...current, entry];
    });
  };

  const profileSlotList = normalizeMealSlots(profileMealSlots);
  const settingsSlotList = normalizeMealSlots(settingsMealSlots);
  const settingsTableReservationEnabled = isReservationModeEnabled(settingsReservationMode);
  const restaurantProviderScopes = normalizeProviderScopesForEdit(restaurant?.providerScopes);
  const restaurantOffersFood = restaurantProviderScopes.includes('food');
  const restaurantOffersEvents = eventsEnabled && restaurantProviderScopes.includes('events');
  const restaurantEventsReady = restaurantOffersEvents && Boolean(restaurant?.eventSetupCompletedAt);
  const isOnboardingMode = Boolean(restaurant?.onboardingRequired) && restaurantOffersFood;
  const onboardingDraft = restaurant?.onboardingDraft || null;
  const activeOpeningDayCount = useMemo(
    () => openingHourDays.filter((day) => settingsOpeningHours?.[day.key]?.enabled).length,
    [settingsOpeningHours]
  );

  useEffect(() => {
    if (!timePickerState.visible) return undefined;
    const selectedIndex = Math.max(0, openingTimeOptions.indexOf(timePickerState.value));
    const timeout = setTimeout(() => {
      openingTimePickerScrollRef.current?.scrollTo({
        y: Math.max(0, Math.floor(selectedIndex / 3) * 64 - 96),
        animated: false
      });
    }, 0);
    return () => clearTimeout(timeout);
  }, [timePickerState.value, timePickerState.visible]);
  const selectedSpecialClosureLabel = settingsSpecialClosureDate
    ? formatIsoDateLabel(settingsSpecialClosureDate)
    : 'Datum wählen';

  const getMenuDraftState = (kind = 'normal') =>
    kind === 'lunch'
      ? {
          draft: lunchMenuDraft,
          setDraft: setLunchMenuDraft,
          dirty: lunchMenuDirty,
          setDirty: setLunchMenuDirty,
          dietFilter: lunchMenuDietFilter,
          setDietFilter: setLunchMenuDietFilter,
          status: lunchMenuStatus,
          setStatus: setLunchMenuStatus,
          error: lunchMenuError,
          setError: setLunchMenuError,
          loading: lunchMenuLoading,
          setLoading: setLunchMenuLoading,
          saving: lunchMenuSaving,
          setSaving: setLunchMenuSaving,
          allergensText: lunchMenuAllergensText,
          setAllergensText: setLunchMenuAllergensText
        }
      : {
          draft: digitalMenuDraft,
          setDraft: setDigitalMenuDraft,
          dirty: digitalMenuDirty,
          setDirty: setDigitalMenuDirty,
          dietFilter: digitalMenuDietFilter,
          setDietFilter: setDigitalMenuDietFilter,
          status: digitalMenuStatus,
          setStatus: setDigitalMenuStatus,
          error: digitalMenuError,
          setError: setDigitalMenuError,
          loading: digitalMenuLoading,
          setLoading: setDigitalMenuLoading,
          saving: digitalMenuSaving,
          setSaving: setDigitalMenuSaving,
          allergensText: digitalMenuAllergensText,
          setAllergensText: setDigitalMenuAllergensText
        };

  const ensureOfferMealSlotEnabled = async (slotKey) => {
    if (!slotKey) return false;
    if (profileSlotList.includes(slotKey)) return true;
    const nextSlots = normalizeMealSlots([...profileSlotList, slotKey]);
    const ok = await updateRestaurantProfile({ mealSlots: nextSlots });
    if (!ok) return false;
    setProfileMealSlots(nextSlots);
    setSettingsMealSlots(nextSlots);
    setStatus(`${mealSlotLabelByKey[slotKey] || slotKey} aktiviert.`);
    return true;
  };

  useEffect(() => {
    if (!restaurant) return;
    const restaurantSlots = toEditableMealSlots(restaurant.mealSlots);
    const onboardingSource = restaurant.onboardingRequired
      ? restaurant.onboardingDraft || {
          mealSlots: [],
          cuisineTypes: [],
          tableReservationEnabled: false,
          tableReservationChoiceMade: false,
          reservationMode: 'disabled',
          reservationExternalLink: '',
          reservationExternalEmail: '',
          reservationExternalPhone: '',
          openingHours: createDefaultOpeningHours(),
          aboutText: '',
          lastStep: 0
        }
      : null;
    setProfileMealSlots(restaurantSlots);
    setSettingsMealSlots(
      onboardingSource ? toEditableMealSlots(onboardingSource.mealSlots) : restaurantSlots
    );
    setSettingsReservationMode(
      onboardingSource
        ? normalizeReservationMode(
            onboardingSource.reservationMode,
            Boolean(onboardingSource.tableReservationEnabled)
          )
        : normalizeReservationMode(restaurant.reservationMode, Boolean(restaurant.tableReservationEnabled))
    );
    setSettingsReservationExternalLink(
      String(
        onboardingSource
          ? onboardingSource.reservationExternalLink || ''
          : restaurant.reservationExternalLink || ''
      ).trim()
    );
    setSettingsReservationExternalEmail(
      String(
        onboardingSource
          ? onboardingSource.reservationExternalEmail || ''
          : restaurant.reservationExternalEmail || ''
      ).trim()
    );
    setSettingsReservationExternalPhone(
      String(
        onboardingSource
          ? onboardingSource.reservationExternalPhone || ''
          : restaurant.reservationExternalPhone || ''
      ).trim()
    );
    setSettingsCuisineTypes(
      onboardingSource
        ? normalizeCuisineTypes(onboardingSource.cuisineTypes)
        : normalizeCuisineTypes(restaurant.cuisineTypes)
    );
    setSettingsOpeningHours(
      normalizeOpeningHours(onboardingSource ? onboardingSource.openingHours : restaurant.openingHours)
    );
    setSettingsAboutText(
      String(onboardingSource ? onboardingSource.aboutText || '' : restaurant.aboutText || '').trim()
    );
    setSettingsWebsiteSyncUrl(String(restaurant.websiteSyncUrl || '').trim());
    setSettingsSocialLinks(normalizeSocialLinksForEdit(restaurant.socialLinks));
    setSettingsLogoUri(String(restaurant.logoUrl || '').trim());
    setSettingsProviderScopes(normalizeProviderScopesForEdit(restaurant.providerScopes));
    setSettingsEventOfferingsText(String(restaurant.eventProfile?.offeringsText || '').trim());
    setSettingsEventReservationUrl(String(restaurant.eventProfile?.reservationUrl || '').trim());
    setSettingsEventContactUrl(String(restaurant.eventProfile?.contactUrl || '').trim());
    setSettingsEventContactEmail(String(restaurant.eventProfile?.contactEmail || '').trim());
    setSettingsEventContactPhone(String(restaurant.eventProfile?.contactPhone || '').trim());
    setSettingsCateringOfferingsText(String(restaurant.cateringProfile?.offeringsText || '').trim());
    setSettingsCateringContactUrl(String(restaurant.cateringProfile?.contactUrl || '').trim());
    setSettingsCateringContactEmail(String(restaurant.cateringProfile?.contactEmail || '').trim());
    setSettingsCateringContactPhone(String(restaurant.cateringProfile?.contactPhone || '').trim());
    setSettingsSpecialClosures(normalizeSpecialClosureEntries(restaurant.specialClosures));
    setSettingsName(String(restaurant.name || '').trim());
    setSettingsEmail(String(restaurant.email || '').trim());
    setSettingsPhone(String(restaurant.phone || '').trim());
    setSettingsAddress(String(restaurant.address || '').trim());
    setSettingsPostalCode(String(restaurant.postalCode || '').trim());
    setSettingsSpecialClosureDate('');
    setSettingsSpecialClosureReason('');
    setSettingsSpecialClosurePickerOpen(false);
    setOnboardingReservationChoiceMade(
      onboardingSource ? Boolean(onboardingSource.tableReservationChoiceMade) : true
    );
    setOnboardingStepIndex(
      onboardingSource
        ? Math.max(0, Math.min(restaurantOnboardingSteps.length - 1, Number(onboardingSource.lastStep || 0)))
        : 0
    );
    if (!restaurantSlots.includes(offerMealSlot)) {
      setOfferMealSlot(restaurantSlots[0] || DEFAULT_MEAL_SLOT);
    }
  }, [restaurant]);

  useEffect(() => {
    setReviewReplyDrafts((prev) => {
      const next = {};
      (restaurantReviews || []).forEach((review) => {
        next[review.id] =
          Object.prototype.hasOwnProperty.call(prev, review.id)
            ? prev[review.id]
            : String(review.replyText || '');
      });
      return next;
    });
  }, [restaurantReviews]);

  useEffect(() => {
    if (Platform.OS === 'web' || !restaurant?.id) return undefined;
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response?.notification?.request?.content?.data || {};
      if (data?.type !== 'review_created') return;
      setActivePanel('reviews');
      setHighlightedReviewId(String(data.reviewId || ''));
      void loadRestaurantReviews();
      setTimeout(() => {
        scrollRef.current?.scrollTo?.({ y: 0, animated: true });
      }, 0);
    });
    return () => subscription.remove();
  }, [restaurant?.id]);

  useEffect(() => {
    if (!restaurant?.id) return;
    setActivePanel(null);
    setDigitalMenuDirty(false);
    setDigitalMenuDietFilter('all');
    setLunchMenuDirty(false);
    setLunchMenuDietFilter('all');
  }, [restaurant?.id]);

  useEffect(() => {
    if (!restaurant?.id) {
      onboardingHintHandledRef.current = false;
      setOnboardingAssistantOpen(false);
      return;
    }
    onboardingHintHandledRef.current = true;
    setOnboardingAssistantOpen(false);
  }, [restaurant?.id, restaurant?.onboardingRequired]);

  useEffect(() => {
    if (!restaurant?.id) return undefined;

    const refresh = () => {
      void loadRestaurantOrders();
      void loadRestaurantReservations();
    };

    refresh();
    const intervalId = setInterval(refresh, 25000);
    return () => clearInterval(intervalId);
  }, [restaurant?.id]);

  useEffect(() => {
    let active = true;

    const loadDigitalMenu = async () => {
      if (!restaurant) {
        setDigitalMenuDraft({ ...emptyDigitalMenuDraft });
        setDigitalMenuDirty(false);
        setDigitalMenuStatus('');
        setDigitalMenuError('');
        return;
      }
      if (restaurant.onboardingRequired) {
        const result = restaurant.onboardingDraft?.digitalMenu || {
          items: [],
          allergens: [],
          updatedAt: null
        };
        if (!active) return;
        setDigitalMenuDraft(buildDigitalMenuDraft({ menu: result, updatedAt: result.updatedAt }));
        setDigitalMenuDirty(false);
        setDigitalMenuStatus('');
        setDigitalMenuError('');
        return;
      }
      if (digitalMenuDirty) return;

      try {
        const result = await getRestaurantDigitalMenu();
        if (!active) return;
        setDigitalMenuDraft(buildDigitalMenuDraft(result));
        setDigitalMenuDirty(false);
      } catch (error) {
        if (!active) return;
        const detail = error instanceof Error ? error.message : '';
        setDigitalMenuError(detail || 'Digitales Menü konnte nicht geladen werden.');
      }
    };

    loadDigitalMenu();
    return () => {
      active = false;
    };
  }, [restaurant?.id, restaurant?.onboardingRequired, restaurant?.onboardingDraft, digitalMenuDirty, getRestaurantDigitalMenu]);

  useEffect(() => {
    setDigitalMenuAllergensText((digitalMenuDraft.allergens || []).join('\n'));
  }, [digitalMenuDraft.allergens]);

  useEffect(() => {
    let active = true;

    const loadLunchMenu = async () => {
      if (!restaurant) {
        if (!active) return;
        setLunchMenuDraft({ ...emptyDigitalMenuDraft });
        setLunchMenuDirty(false);
        setLunchMenuStatus('');
        setLunchMenuError('');
        return;
      }
      if (restaurant.onboardingRequired) {
        const result = restaurant.onboardingDraft?.lunchMenu || {
          items: [],
          allergens: [],
          updatedAt: null
        };
        if (!active) return;
        setLunchMenuDraft(
          buildDigitalMenuDraft({ menu: result, updatedAt: result.updatedAt }, { lunchMode: true })
        );
        setLunchMenuDirty(false);
        setLunchMenuStatus('');
        setLunchMenuError('');
        return;
      }
      if (lunchMenuDirty) return;

      try {
        const result = await getRestaurantLunchMenu();
        if (!active) return;
        setLunchMenuDraft(buildDigitalMenuDraft(result, { lunchMode: true }));
        setLunchMenuDirty(false);
      } catch (error) {
        if (!active) return;
        const detail = error instanceof Error ? error.message : '';
        setLunchMenuError(detail || 'Mittagstisch-Karte konnte nicht geladen werden.');
      }
    };

    loadLunchMenu();
    return () => {
      active = false;
    };
  }, [restaurant?.id, restaurant?.onboardingRequired, restaurant?.onboardingDraft, lunchMenuDirty, getRestaurantLunchMenu]);

  useEffect(() => {
    setLunchMenuAllergensText((lunchMenuDraft.allergens || []).join('\n'));
  }, [lunchMenuDraft.allergens]);

  useEffect(() => {
    if (authMode !== 'register') {
      setRegisterCitySuggestions([]);
      setRegisterCityLookupLoading(false);
      setRegisterCityLookupError('');
      setRegisterStreetSuggestions([]);
      setRegisterStreetLookupLoading(false);
      setRegisterStreetLookupError('');
      return undefined;
    }

    const query = registerCity.trim();
    if (query.length < CITY_LOOKUP_MIN_CHARS) {
      setRegisterCitySuggestions([]);
      setRegisterCityLookupLoading(false);
      setRegisterCityLookupError('');
      return undefined;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setRegisterCityLookupLoading(true);
      setRegisterCityLookupError('');

      try {
        const regexPrefix = `^${escapeRegexPattern(query)}`;
        const pages = query.length <= 2 ? ['1', '2'] : ['1'];
        const pagePayloads = await Promise.all(
          pages.map(async (page) => {
            const url = new URL('https://openplzapi.org/de/Localities');
            url.searchParams.set('name', regexPrefix);
            url.searchParams.set('page', page);
            url.searchParams.set('pageSize', '50');

            const response = await fetch(url.toString(), {
              method: 'GET',
              headers: {
                Accept: 'application/json'
              },
              signal: controller.signal
            });

            if (!response.ok) {
              throw new Error('CITY_LOOKUP_FAILED');
            }

            const payload = await response.json();
            return Array.isArray(payload) ? payload : [];
          })
        );

        const rows = pagePayloads.flat();
        const unique = new Map();

        rows
          .map((entry) => toCitySuggestion(entry, query))
          .filter(Boolean)
          .forEach((entry) => {
            const key = `${entry.city}|${entry.state}`.toLowerCase();
            if (!unique.has(key)) {
              unique.set(key, entry);
            }
          });

        const suggestions = Array.from(unique.values())
          .sort((a, b) => {
            const aExact = a.city.toLowerCase() === query ? 1 : 0;
            const bExact = b.city.toLowerCase() === query ? 1 : 0;
            if (aExact !== bExact) return bExact - aExact;
            const aCityLike = /stadt/i.test(String(a.municipalityType || '')) ? 1 : 0;
            const bCityLike = /stadt/i.test(String(b.municipalityType || '')) ? 1 : 0;
            if (aCityLike !== bCityLike) return bCityLike - aCityLike;
            return a.label.localeCompare(b.label, 'de', { sensitivity: 'base' });
          })
          .slice(0, 20);

        setRegisterCitySuggestions(suggestions);
      } catch (error) {
        if (controller.signal.aborted) return;
        setRegisterCitySuggestions([]);
        setRegisterCityLookupError('Stadtvorschläge konnten nicht geladen werden.');
      } finally {
        if (!controller.signal.aborted) {
          setRegisterCityLookupLoading(false);
        }
      }
    }, CITY_LOOKUP_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [authMode, registerCity]);

  useEffect(() => {
    if (authMode !== 'register') {
      setRegisterStreetSuggestions([]);
      setRegisterStreetLookupLoading(false);
      setRegisterStreetLookupError('');
      return undefined;
    }

    const streetQuery = registerAddress.trim();
    const cityQuery = registerCity.trim();
    if (streetQuery.length < STREET_LOOKUP_MIN_CHARS) {
      setRegisterStreetSuggestions([]);
      setRegisterStreetLookupLoading(false);
      setRegisterStreetLookupError('');
      return undefined;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setRegisterStreetLookupLoading(true);
      setRegisterStreetLookupError('');

      try {
        const url = new URL('https://openplzapi.org/de/Streets');
        url.searchParams.set('name', `^${escapeRegexPattern(streetQuery)}`);
        if (cityQuery.length >= CITY_LOOKUP_MIN_CHARS) {
          url.searchParams.set('locality', `^${escapeRegexPattern(cityQuery)}`);
        }
        if (registerPostal.trim()) {
          url.searchParams.set('postalCode', registerPostal.trim());
        }
        url.searchParams.set('page', '1');
        url.searchParams.set('pageSize', '50');

        const response = await fetch(url.toString(), {
          method: 'GET',
          headers: {
            Accept: 'application/json'
          },
          signal: controller.signal
        });

        if (!response.ok) {
          throw new Error('STREET_LOOKUP_FAILED');
        }

        const payload = await response.json();
        const rows = Array.isArray(payload) ? payload : [];
        const unique = new Map();
        rows
          .map((entry) => toStreetSuggestion(entry, streetQuery))
          .filter(Boolean)
          .forEach((entry) => {
            if (!unique.has(entry.id)) {
              unique.set(entry.id, entry);
            }
          });

        const suggestions = Array.from(unique.values())
          .sort((a, b) => a.label.localeCompare(b.label, 'de', { sensitivity: 'base' }))
          .slice(0, 20);

        setRegisterStreetSuggestions(suggestions);
      } catch (error) {
        if (controller.signal.aborted) return;
        setRegisterStreetSuggestions([]);
        setRegisterStreetLookupError('Straßenvorschläge konnten nicht geladen werden.');
      } finally {
        if (!controller.signal.aborted) {
          setRegisterStreetLookupLoading(false);
        }
      }
    }, CITY_LOOKUP_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [authMode, registerAddress, registerCity, registerPostal]);

  const handleSelectRegisterCity = (entry) => {
    setRegisterCity(String(entry?.city || '').trim());
    setRegisterCitySuggestions([]);
    setRegisterCityLookupError('');
    setRegisterStreetSuggestions([]);
    setRegisterStreetLookupError('');
    if (!registerPostal.trim() && entry?.postcode) {
      setRegisterPostal(entry.postcode);
    }
  };

  const handleSelectRegisterStreet = (entry) => {
    setRegisterAddress(String(entry?.street || '').trim());
    setRegisterStreetSuggestions([]);
    setRegisterStreetLookupError('');
    if (!registerCity.trim() && entry?.locality) {
      setRegisterCity(entry.locality);
    }
    if (!registerPostal.trim() && entry?.postcode) {
      setRegisterPostal(entry.postcode);
    }
  };

  const handlePickRegisterLogo = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        allowsEditing: true,
        legacy: false
      });
      if (result.canceled) return;
      const selected = result.assets?.[0];
      if (!selected?.uri) return;
      setRegisterLogoUri(selected.uri);
      setStatus('');
    } catch {
      setStatus('Logo konnte nicht geladen werden. Bitte über Datei/Galerie erneut versuchen.');
    }
  };

  const handlePickRestaurantLogo = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        allowsEditing: true,
        legacy: false
      });
      if (result.canceled) return;
      const selected = result.assets?.[0];
      if (!selected?.uri) return;

      setSettingsLogoUploading(true);
      setStatus('');
      const uploadedLogoUrl = await uploadRestaurantLogo({
        uri: selected.uri,
        name: selected.fileName || `restaurant-logo-${Date.now()}.jpg`,
        mimeType: selected.mimeType || 'image/jpeg',
        file: selected.file
      });
      if (uploadedLogoUrl) {
        setSettingsLogoUri(uploadedLogoUrl);
        setStatus('Restaurant-Logo gespeichert.');
      } else {
        setStatus((prev) => prev || 'Logo konnte nicht hochgeladen werden.');
      }
    } catch {
      setStatus('Logo konnte nicht geladen werden. Bitte über Datei/Galerie erneut versuchen.');
    } finally {
      setSettingsLogoUploading(false);
    }
  };

  const handleOpenExternalLink = async (url) => {
    try {
      await Linking.openURL(url);
    } catch {
      setStatus('Link konnte nicht geöffnet werden.');
    }
  };

  const handleLogin = async () => {
    setStatus('');
    if (!loginEmail.trim() || !loginPassword.trim()) {
      setStatus('Bitte E-Mail und Passwort eingeben.');
      return;
    }
    await login(loginEmail.trim(), loginPassword.trim(), rememberMe);
  };

  const openPasswordReset = () => {
    setStatus('');
    setResetEmail(loginEmail.trim());
    setResetCode('');
    setResetPassword('');
    setResetPasswordConfirm('');
    setResetCodeSent(false);
    setAuthMode('resetPassword');
  };

  const handleRequestPasswordReset = async () => {
    setStatus('');
    const email = resetEmail.trim();
    if (!email) {
      setStatus('Bitte E-Mail eingeben.');
      return;
    }
    const ok = await requestRestaurantPasswordReset(email);
    if (ok) {
      setResetCodeSent(true);
      setStatus('Wenn die E-Mail registriert ist, wurde ein Code gesendet.');
    }
  };

  const handleConfirmPasswordReset = async () => {
    setStatus('');
    const email = resetEmail.trim();
    const code = resetCode.trim();
    const password = resetPassword.trim();
    const passwordConfirm = resetPasswordConfirm.trim();
    if (!email || !code || !password || !passwordConfirm) {
      setStatus('Bitte E-Mail, Code und neues Passwort eingeben.');
      return;
    }
    if (password.length < 6) {
      setStatus('Das neue Passwort muss mindestens 6 Zeichen haben.');
      return;
    }
    if (password !== passwordConfirm) {
      setStatus('Die Passwörter stimmen nicht überein.');
      return;
    }

    const ok = await confirmRestaurantPasswordReset({ email, code, password });
    if (ok) {
      setLoginEmail(email);
      setLoginPassword('');
      setResetCode('');
      setResetPassword('');
      setResetPasswordConfirm('');
      setResetCodeSent(false);
      setAuthMode('login');
      setStatus('Passwort geändert. Du kannst dich jetzt einloggen.');
    }
  };

  const handleRegister = async () => {
    setStatus('');
    if (
      !registerName.trim() ||
      !registerEmail.trim() ||
      !registerPassword.trim() ||
      !registerPhone.trim() ||
      !registerAddress.trim() ||
      !registerCity.trim() ||
      !registerPostal.trim()
    ) {
      setStatus('Bitte alle Felder ausfüllen.');
      return;
    }

    if (!registerTermsAccepted || !registerPrivacyAccepted) {
      setStatus('Bitte AGB und Datenschutz akzeptieren.');
      return;
    }

    const ok = await registerRestaurant({
      name: registerName.trim(),
      email: registerEmail.trim(),
      password: registerPassword.trim(),
      phone: registerPhone.trim(),
      address: `${registerAddress.trim()}, ${registerCity.trim()}`,
      postalCode: registerPostal.trim(),
      providerScopes:
        eventsEnabled || cateringEnabled
          ? normalizeProviderScopesForEdit(registerProviderScopes)
          : ['food'],
      termsAccepted: registerTermsAccepted,
      privacyAccepted: registerPrivacyAccepted,
      mealSlots: []
    });

    if (ok) {
      setLoginEmail(registerEmail.trim());
      setLoginPassword('');
      setRegisterTermsAccepted(false);
      setRegisterPrivacyAccepted(false);
      setRegisterStreetSuggestions([]);
      setRegisterStreetLookupError('');
      setRegisterCitySuggestions([]);
      setRegisterCityLookupError('');
      setRegisterProviderScopes(['food']);
      setAuthMode('login');
      setStatus('Registrierung gesendet. Deine Anfrage wartet jetzt auf Freischaltung durch den Admin.');
    }
  };

  const handlePickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.7,
        allowsEditing: true,
        legacy: false
      });
      if (!result.canceled) {
        const selected = result.assets?.[0];
        if (!selected) return;
        setImageUri(selected.uri);
        setImageAsset({
          uri: selected.uri,
          name: selected.fileName || `offer-image-${Date.now()}.jpg`,
          mimeType: selected.mimeType || 'image/jpeg',
          file: selected.file
        });
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : '';
      setStatus(detail ? `Bild konnte nicht geladen werden: ${detail}` : 'Bild konnte nicht geladen werden.');
    }
  };

  const runMenuPicker = async (pick) => {
    if (menuPickerInProgressRef.current) {
      const error = new Error(MENU_PICKER_BUSY_MESSAGE);
      error.code = 'MENU_PICKER_IN_PROGRESS';
      throw error;
    }

    menuPickerInProgressRef.current = true;
    setMenuPickerInProgress(true);
    try {
      return await pick();
    } finally {
      menuPickerInProgressRef.current = false;
      setMenuPickerInProgress(false);
    }
  };

  const waitForMenuPickerPresentation = () =>
    new Promise((resolve) => {
      requestAnimationFrame(() => {
        setTimeout(resolve, Platform.OS === 'web' ? 0 : MENU_PICKER_SHEET_CLOSE_DELAY_MS);
      });
    });

  const pickMenuFromFiles = () =>
    runMenuPicker(async () => {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
        multiple: false
      });

      if (result.canceled) return null;
      return normalizeMenuAsset(result.assets?.[0], 'menu-file');
    });

  const requestIosMenuPhotoAccess = async () => {
    if (Platform.OS !== 'ios') return;
    const currentPermission = await ImagePicker.getMediaLibraryPermissionsAsync();
    if (!currentPermission.granted) {
      await ImagePicker.requestMediaLibraryPermissionsAsync();
    }
  };

  const pickMenuFromGallery = () =>
    runMenuPicker(async () => {
      await requestIosMenuPhotoAccess();
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        // On iOS use the original Photos asset. The native picker patch downloads iCloud
        // originals directly before falling back to NSItemProvider's JPEG conversion.
        quality: Platform.OS === 'ios' ? 1 : 0.8,
        allowsEditing: false,
        legacy: false,
        ...(Platform.OS === 'ios'
          ? { preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current }
          : {})
      });

      if (result.canceled) return null;
      return normalizeMenuAsset(result.assets?.[0], 'menu-gallery');
    });

  const pickDigitalMenuFromFiles = () =>
    runMenuPicker(async () => {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
        multiple: true
      });

      if (result.canceled) return [];
      return normalizeMenuAssets(result.assets, 'menu-file');
    });

  const pickDigitalMenuFromGallery = () =>
    runMenuPicker(async () => {
      await requestIosMenuPhotoAccess();
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        // See pickMenuFromGallery: this keeps the original asset path available on iOS.
        quality: Platform.OS === 'ios' ? 1 : 0.8,
        allowsEditing: false,
        allowsMultipleSelection: true,
        selectionLimit: MAX_DIGITAL_MENU_FILES,
        legacy: false,
        ...(Platform.OS === 'ios'
          ? { preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current }
          : {})
      });

      if (result.canceled) return [];
      return normalizeMenuAssets(result.assets, 'menu-gallery');
    });

  const pickMenuFromCamera = async () => {
    const { status: permission } = await ImagePicker.requestCameraPermissionsAsync();
    if (permission !== 'granted') {
      await new Promise((resolve) => {
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          resolve();
        };
        Alert.alert(
          'Kamera nicht freigegeben',
          'Um Fotos für dein Menü aufzunehmen, aktiviere die Kamera in den App-Einstellungen.',
          [
            { text: 'Abbrechen', style: 'cancel', onPress: done },
            {
              text: 'Einstellungen öffnen',
              onPress: async () => {
                await Linking.openSettings().catch(() => undefined);
                done();
              }
            }
          ],
          { cancelable: true, onDismiss: done }
        );
      });
      return null;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: false
    });

    if (result.canceled) return null;
    return normalizeMenuAsset(result.assets?.[0], 'menu-camera');
  };

  const shouldCaptureAnotherMenuPhoto = (count) =>
    new Promise((resolve) => {
      let settled = false;
      const done = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      Alert.alert(
        'Menüfoto aufgenommen',
        `${count} von ${MAX_MENU_CAMERA_IMAGES} Fotos aufgenommen.`,
        [
          { text: 'Fertig – Bilder analysieren', onPress: () => done(false) },
          { text: 'Weiteres Foto aufnehmen', onPress: () => done(true) }
        ],
        {
          cancelable: true,
          onDismiss: () => done(false)
        }
      );
    });

  const pickDigitalMenuFromCamera = async () => {
    return runMenuPicker(async () => {
      const assets = [];

      while (assets.length < MAX_MENU_CAMERA_IMAGES) {
        const asset = await pickMenuFromCamera();
        if (!asset) return assets;

        assets.push(asset);
        if (assets.length >= MAX_MENU_CAMERA_IMAGES) return assets;

        const captureAnother = await shouldCaptureAnotherMenuPhoto(assets.length);
        if (!captureAnother) return assets;
      }

      return assets;
    });
  };

  const selectDigitalMenuSource = () => {
    if (Platform.OS === 'web') {
      return Promise.resolve('file');
    }

    return new Promise((resolve) => {
      let settled = false;
      const done = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      Alert.alert(
        'Digitales Menü',
        'Wie möchtest du dein Menü hinzufügen?',
        [
          { text: 'Foto machen', onPress: () => done('camera') },
          { text: 'Galerie', onPress: () => done('gallery') },
          { text: 'Datei', onPress: () => done('file') },
          { text: 'Abbrechen', style: 'cancel', onPress: () => done(null) }
        ],
        {
          cancelable: true,
          onDismiss: () => done(null)
        }
      );
    });
  };

  const selectMenuFileFallback = () =>
    new Promise((resolve) => {
      let settled = false;
      const done = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      Alert.alert(
        'Foto konnte nicht gelesen werden',
        'iOS konnte das ausgewählte Foto nicht bereitstellen. Du kannst das Menü jetzt über Dateien auswählen.',
        [
          { text: 'Abbrechen', style: 'cancel', onPress: () => done(false) },
          { text: 'Über Dateien auswählen', onPress: () => done(true) }
        ],
        {
          cancelable: true,
          onDismiss: () => done(false)
        }
      );
    });

  const pickDigitalMenuAssetsFromSource = async (source) => {
    if (!source) return [];
    if (source === 'camera') {
      return pickDigitalMenuFromCamera();
    }
    if (source === 'gallery') {
      try {
        return await pickDigitalMenuFromGallery();
      } catch (error) {
        if (Platform.OS !== 'ios' || !isIosPhotoRepresentationError(error)) {
          throw error;
        }

        const originalMessage = error instanceof Error ? error.message : String(error || '');
        const diagnosticId = reportClientMenuError(
          'picker',
          'IOS_PHOTO_REPRESENTATION_FAILED',
          originalMessage
        );
        const useFilePicker = await selectMenuFileFallback();
        if (useFilePicker) {
          return pickDigitalMenuFromFiles();
        }

        const friendlyError = new Error(
          `iOS konnte das ausgewählte Foto nicht lesen. Bitte erneut versuchen oder über Dateien auswählen. Fehler-ID: ${diagnosticId}`
        );
        friendlyError.code = 'IOS_PHOTO_REPRESENTATION_FAILED';
        friendlyError.diagnosticId = diagnosticId;
        throw friendlyError;
      }
    }
    return pickDigitalMenuFromFiles();
  };

  const pickDigitalMenuAssets = async () => {
    const source = await selectDigitalMenuSource();
    if (!source) return [];
    await waitForMenuPickerPresentation();
    return pickDigitalMenuAssetsFromSource(source);
  };

  const handlePickMenu = async () => {
    try {
      const chooseUploadMode = () => {
        if (!hasUploadedMenu) {
          return Promise.resolve('replace');
        }

        if (Platform.OS === 'web') {
          if (typeof globalThis.confirm !== 'function') {
            return Promise.resolve('replace');
          }

          const replaceConfirmed = globalThis.confirm(
            'Es gibt bereits ein Menü.\nOK = Altes überschreiben\nAbbrechen = Weitere Optionen'
          );
          if (replaceConfirmed) {
            return Promise.resolve('replace');
          }

          const appendConfirmed = globalThis.confirm(
            'Neue Datei zum Menü ergänzen?\nOK = Ergänzen dazu\nAbbrechen = Upload abbrechen'
          );
          return Promise.resolve(appendConfirmed ? 'append' : null);
        }

        return new Promise((resolve) => {
          let settled = false;
          const done = (value) => {
            if (settled) return;
            settled = true;
            resolve(value);
          };

          Alert.alert(
            'Menü hochladen',
            'Es gibt bereits ein Menü. Was möchtest du machen?',
            [
              { text: 'Altes überschreiben', onPress: () => done('replace') },
              { text: 'Ergänzen dazu', onPress: () => done('append') },
              { text: 'Abbrechen', style: 'cancel', onPress: () => done(null) }
            ],
            {
              cancelable: true,
              onDismiss: () => done(null)
            }
          );
        });
      };

      let asset = null;
      if (Platform.OS === 'web') {
        asset = await pickMenuFromFiles();
        if (!asset) return;
      }

      const mode = await chooseUploadMode();
      if (!mode) return;

      if (!asset) {
        await waitForMenuPickerPresentation();
        asset = await pickMenuFromFiles();
        if (!asset) return;
      }

      const mimeType = String(asset.mimeType || '').toLowerCase();
      if (!isAllowedMenuMimeType(mimeType)) {
        setStatus('Nur PDF oder Bild-Dateien sind erlaubt.');
        return;
      }

      const ok = await uploadRestaurantMenu({
        uri: asset.uri,
        name: asset.name || 'menu',
        mimeType: asset.mimeType || 'application/octet-stream',
        file: asset.file
      }, mode);

      if (ok) {
        setStatus(mode === 'append' ? 'Menü-Datei ergänzt.' : 'Restaurant-Menü hochgeladen.');
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : '';
      setStatus(
        isMenuPickerInProgressError(error)
          ? MENU_PICKER_BUSY_MESSAGE
          : detail || 'Menü konnte nicht hochgeladen werden.'
      );
      if (!error?.diagnosticId && !error?.payload?.diagnosticId) {
        reportClientMenuError('single_upload', error?.code || 'CLIENT_UPLOAD_ERROR', detail);
      }
    }
  };

  const reportClientMenuError = (stage, errorCode, message, assets = []) => {
    const firstAsset = Array.isArray(assets) ? assets[0] : null;
    const diagnosticId = createClientMenuDiagnosticId();
    void reportRestaurantMenuDiagnostic({
      diagnosticId,
      stage,
      errorCode,
      message: String(message || '').slice(0, 500),
      fileName: firstAsset?.name,
      declaredMimeType: firstAsset?.mimeType,
      fileCount: Array.isArray(assets) ? assets.length : 0
    });
    return diagnosticId;
  };

  const handleGenerateDigitalMenu = async (kind = 'normal', options = {}) => {
    const menuState = getMenuDraftState(kind);
    const isLunchMenu = kind === 'lunch';
    const hasRecognizedItems = Array.isArray(menuState.draft?.items) && menuState.draft.items.length > 0;

    if (menuState.loading) return;
    menuState.setStatus('');
    menuState.setError('');
    menuState.setLoading(true);
    menuState.setStatus('Dateiauswahl wird geöffnet...');

    try {
      const chooseDigitalImportMode = () => {
        if (!hasRecognizedItems) {
          return Promise.resolve('replace');
        }

        if (Platform.OS === 'web') {
          if (typeof globalThis.confirm !== 'function') {
            return Promise.resolve('replace');
          }

          const replaceConfirmed = globalThis.confirm(
            `Es gibt bereits ${
              isLunchMenu ? 'eine Mittagstisch-Karte' : 'ein digitales Menü'
            }.\nOK = Altes Menü komplett ersetzen\nAbbrechen = Weitere Optionen`
          );
          if (replaceConfirmed) {
            return Promise.resolve('replace');
          }

          const appendConfirmed = globalThis.confirm(
            `Neue Datei(en) mit KI lesen und zum bestehenden ${
              isLunchMenu ? 'Mittagstisch' : 'Menü'
            } hinzufügen?\nOK = Menü erweitern\nAbbrechen = Import abbrechen`
          );
          return Promise.resolve(appendConfirmed ? 'append' : null);
        }

        return new Promise((resolve) => {
          let settled = false;
          const done = (value) => {
            if (settled) return;
            settled = true;
            resolve(value);
          };

          Alert.alert(
            isLunchMenu ? 'Mittagstisch mit KI' : 'Menü mit KI',
            `Es gibt bereits erkannte ${
              isLunchMenu ? 'Mittagstisch-Gerichte' : 'Gerichte'
            }. Möchtest du alles neu ersetzen oder die neuen Daten zum bestehenden Menü hinzufügen?`,
            [
              { text: 'Altes Menü komplett ersetzen', onPress: () => done('replace') },
              { text: 'Bestehendes Menü erweitern', onPress: () => done('append') },
              { text: 'Abbrechen', style: 'cancel', onPress: () => done(null) }
            ],
            {
              cancelable: true,
              onDismiss: () => done(null)
            }
          );
        });
      };

      const assets = options.source
        ? await pickDigitalMenuAssetsFromSource(options.source)
        : await pickDigitalMenuAssets();
      if (!assets.length) return;

      const importMode = options.importMode || await chooseDigitalImportMode();
      if (!importMode) return;

      if (assets.length > MAX_DIGITAL_MENU_FILES) {
        const message = `Bitte maximal ${MAX_DIGITAL_MENU_FILES} Dateien auswählen.`;
        menuState.setError(message);
        reportClientMenuError('validation', 'TOO_MANY_FILES', message, assets);
        return;
      }

      const oversizedAsset = assets.find((asset) => Number(asset.fileSize || 0) > MAX_MENU_FILE_BYTES);
      if (oversizedAsset) {
        const message = `${oversizedAsset.name || 'Eine Datei'} ist größer als 10 MB.`;
        menuState.setError(message);
        reportClientMenuError('validation', 'FILE_TOO_LARGE', message, [oversizedAsset]);
        return;
      }
      const knownTotalBytes = assets.reduce((sum, asset) => sum + Number(asset.fileSize || 0), 0);
      if (knownTotalBytes > MAX_MENU_BATCH_BYTES) {
        const message = 'Die ausgewählten Dateien sind zusammen größer als 50 MB.';
        menuState.setError(message);
        reportClientMenuError('validation', 'BATCH_TOO_LARGE', message, assets);
        return;
      }

      const hasUnsupportedFile = assets.some(
        (asset) => !isAllowedMenuMimeType(String(asset.mimeType || '').toLowerCase())
      );
      if (hasUnsupportedFile) {
        const message = 'Nur PDF oder Bild-Dateien sind erlaubt.';
        menuState.setError(message);
        reportClientMenuError('validation', 'UNSUPPORTED_FILE_TYPE', message, assets);
        return;
      }

      if (isOnboardingMode) {
        const uploaded = await uploadRestaurantOnboardingMenu(assets, isLunchMenu ? 'lunch' : 'regular');
        if (!uploaded?.menuFiles?.length) {
          menuState.setError(
            `${isLunchMenu ? 'Mittagstisch-Karte' : 'Speisekarte'} konnte nicht hochgeladen werden.`
          );
          menuState.setStatus('');
          return;
        }
      }

      menuState.setStatus(
        'Bitte warten Sie. Ihre Karte wird nun erstellt.'
      );
      const generated = await generateRestaurantDigitalMenu(
        assets,
        isLunchMenu ? 'lunch' : 'regular'
      );

      if (!generated) {
        menuState.setError('Kein Menü erkannt. Bitte Dateiqualität prüfen und erneut versuchen.');
        menuState.setStatus('');
        return;
      }

      const previousItemCount = Array.isArray(menuState.draft.items) ? menuState.draft.items.length : 0;
      const recognizedDraft = buildDigitalMenuDraft(generated, { lunchMode: isLunchMenu });
      const nextDraft = isLunchMenu
        ? applyLunchValiditySuggestion(recognizedDraft, generated?.lunchValidity)
        : recognizedDraft;
      const draft =
        importMode === 'append'
          ? mergeDigitalMenuDrafts(menuState.draft, nextDraft, { lunchMode: isLunchMenu })
          : nextDraft;
      if (!draft.items.length) {
        menuState.setError('Die Datei war nicht klar genug lesbar. Bitte erneut mit besserer Qualität hochladen.');
        menuState.setStatus('');
        return;
      }

      menuState.setDraft(draft);
      menuState.setDietFilter('all');
      const allergensCount = (draft.allergens || []).length;
      const addedItemsCount =
        importMode === 'append' ? Math.max(0, draft.items.length - previousItemCount) : draft.items.length;

      if (isOnboardingMode) {
        const saveDraftMenu = isLunchMenu
          ? saveRestaurantOnboardingLunchMenu
          : saveRestaurantOnboardingDigitalMenu;
        const saveResult = await saveDraftMenu({
          items: draft.items.map((item) => ({
            id: item.id,
            name: item.name,
            description: item.description,
            price: normalizePriceInput(item.priceText || item.price),
            category: item.category,
            section: item.section,
            allergens: item.allergens,
            ...(isLunchMenu
              ? {
                  availableWeekdays: item.availableWeekdays || [],
                  repeatWeekly: item.repeatWeekly !== false,
                  activeWeekKey: item.activeWeekKey || null,
                  schedulePending: item.schedulePending === true,
                  scheduleMode: item.scheduleMode || null,
                  validFrom: item.validFrom || null,
                  validUntil: item.validUntil || null,
                  active: item.active !== false
                }
              : {})
          })),
          allergens: draft.allergens || []
        });
        const savedDraft = buildDigitalMenuDraft(saveResult, { lunchMode: isLunchMenu });
        menuState.setDraft(
          isLunchMenu ? { ...savedDraft, lunchValidity: draft.lunchValidity } : savedDraft
        );
        menuState.setDirty(false);
        if (isLunchMenu) setLunchValidityReviewRequired(true);
        menuState.setStatus(
          `${
            importMode === 'append'
              ? `${isLunchMenu ? 'Deine Mittagstisch-Karte' : 'Dein digitales Menü'} wurde erweitert. ${addedItemsCount} neue Gerichte wurden hinzugefügt.`
              : `${isLunchMenu ? 'Deine Mittagstisch-Karte' : 'Dein digitales Menü'} ist erstellt. ${savedDraft.items.length} Gerichte aus ${assets.length} Datei(en) erkannt.`
          }` + (allergensCount ? ` Allergene erkannt: ${allergensCount}.` : '')
        );
      } else {
        menuState.setDirty(true);
        if (isLunchMenu) setLunchValidityReviewRequired(true);
        menuState.setStatus(
          `${
            importMode === 'append'
              ? `${isLunchMenu ? 'Mittagstisch-Karte' : 'Digitales Menü'} ergänzt. Jetzt prüfen und speichern. ${addedItemsCount} neue Gerichte hinzugefügt.`
              : `${isLunchMenu ? 'Deine Mittagstisch-Karte' : 'Dein digitales Menü'} ist erstellt. Jetzt prüfen und speichern. ${draft.items.length} Gerichte aus ${assets.length} Datei(en) erkannt.`
          }` + (allergensCount ? ` Allergene erkannt: ${allergensCount}.` : '')
        );
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : '';
      if (isMenuPickerInProgressError(error)) {
        menuState.setError(MENU_PICKER_BUSY_MESSAGE);
        menuState.setStatus('');
        return;
      }
      if (!error?.diagnosticId && !error?.payload?.diagnosticId) {
        reportClientMenuError(
          'picker_or_network',
          error?.code || 'CLIENT_MENU_ERROR',
          detail || 'Menüverarbeitung fehlgeschlagen.'
        );
      }
      menuState.setError(
        detail
          ? `${isLunchMenu ? 'Mittagstisch-Karte' : 'Digitales Menü'} konnte nicht erstellt werden: ${detail}`
          : `${isLunchMenu ? 'Mittagstisch-Karte' : 'Digitales Menü'} konnte nicht erstellt werden.`
      );
      menuState.setStatus('');
    } finally {
      menuState.setLoading(false);
    }
  };

  const menuKindForWorkspace = (workspace = menuWorkspace) =>
    workspace === 'lunch' ? 'lunch' : 'normal';

  const menuDraftHasChanges = (workspace = menuWorkspace) => {
    const kind = menuKindForWorkspace(workspace);
    return kind === 'lunch' ? lunchMenuDirty : digitalMenuDirty;
  };

  const openMenuAddFlow = (kind = 'normal') => {
    const resolvedKind = kind === 'lunch' ? 'lunch' : 'normal';
    if (menuPickerInProgressRef.current) {
      getMenuDraftState(resolvedKind).setError(MENU_PICKER_BUSY_MESSAGE);
      return;
    }
    const hasItems = (getMenuDraftState(resolvedKind).draft.items || []).length > 0;
    if (hasItems) {
      setMenuAddSheet({ visible: true, kind: resolvedKind, step: 'replace', importMode: 'replace' });
      return;
    }
    setMenuAddSheet({ visible: true, kind: resolvedKind, step: 'method', importMode: 'replace' });
  };

  const closeMenuAddFlow = () => setMenuAddSheet({ visible: false, kind: 'normal', step: 'method', importMode: 'replace' });

  const chooseMenuAddMethod = (method) => {
    if (method === 'manual') {
      const kind = menuAddSheet.kind;
      closeMenuAddFlow();
      openMenuItemEditor(null, kind);
      return;
    }
    setMenuAddSheet((current) => ({ ...current, step: 'source' }));
  };

  const chooseMenuUploadMode = (importMode) => {
    setMenuAddSheet((current) => ({ ...current, importMode, step: 'source' }));
  };

  const openMenuCardContent = (kind = 'normal') => {
    const isLunch = kind === 'lunch';
    if (isLunch) setLunchMenuToolsOpen(true);
    else setMenuKiToolsOpen(true);
    requestAnimationFrame(() => {
      const y = isLunch ? lunchMenuContentYRef.current : regularMenuContentYRef.current;
      // The menu content is measured inside the panel card; include the panel header offset.
      scrollRef.current?.scrollTo?.({ y: Math.max(0, y + 120), animated: true });
    });
  };

  const chooseMenuUploadSource = async (source) => {
    const { kind, importMode } = menuAddSheet;
    if (menuPickerInProgressRef.current) {
      getMenuDraftState(kind).setError(MENU_PICKER_BUSY_MESSAGE);
      return;
    }
    closeMenuAddFlow();
    openMenuCardContent(kind);
    await waitForMenuPickerPresentation();
    await handleGenerateDigitalMenu(kind, { source, importMode });
  };

  const clearMenuUndoTimer = () => {
    if (menuUndoTimerRef.current) {
      clearTimeout(menuUndoTimerRef.current);
      menuUndoTimerRef.current = null;
    }
  };

  const restorePendingMenuUndo = () => {
    if (!menuUndo) return;
    clearMenuUndoTimer();
    const menuState = getMenuDraftState(menuUndo.kind);
    menuState.setDraft(menuUndo.previousDraft);
    menuState.setDirty(Boolean(menuUndo.wasDirty));
    menuState.setStatus(menuUndo.type === 'card' ? 'Karte wiederhergestellt.' : 'Gericht wiederhergestellt.');
    setMenuUndo(null);
  };

  const scheduleMenuCardDelete = (kind) => {
    const menuState = getMenuDraftState(kind);
    const previousDraft = menuState.draft;
    const wasDirty = kind === 'lunch' ? lunchMenuDirty : digitalMenuDirty;
    clearMenuUndoTimer();
    menuState.setDraft((current) => ({ ...current, items: [], allergens: [], updatedAt: null }));
    menuState.setDirty(false);
    menuState.setStatus('Karte wird gelöscht. Du kannst dies noch rückgängig machen.');
    setMenuDeleteConfirmKind(null);
    const undo = { type: 'card', kind, previousDraft, wasDirty };
    setMenuUndo(undo);
    menuUndoTimerRef.current = setTimeout(async () => {
      setMenuUndo(null);
      menuUndoTimerRef.current = null;
      await handleClearDigitalMenu(kind);
    }, 5000);
  };

  const scheduleMenuItemDelete = (kind, item) => {
    const menuState = getMenuDraftState(kind);
    const previousDraft = menuState.draft;
    const wasDirty = kind === 'lunch' ? lunchMenuDirty : digitalMenuDirty;
    clearMenuUndoTimer();
    menuState.setDraft((current) => ({
      ...current,
      items: current.items.filter((entry) => entry.id !== item.id)
    }));
    menuState.setDirty(true);
    menuState.setStatus('Gericht entfernt. Du kannst dies noch rückgängig machen.');
    setMenuDeleteConfirmKind(null);
    setMenuUndo({ type: 'item', kind, previousDraft, wasDirty });
    menuUndoTimerRef.current = setTimeout(() => {
      setMenuUndo(null);
      menuUndoTimerRef.current = null;
    }, 5000);
  };

  const requestMenuWorkspace = (target) => {
    const currentKind = ['regular', 'breakfast', 'lunch'].includes(menuWorkspace)
      ? menuKindForWorkspace(menuWorkspace)
      : null;
    const targetKind = ['regular', 'breakfast', 'lunch'].includes(target)
      ? menuKindForWorkspace(target)
      : null;
    if (currentKind && currentKind !== targetKind && menuDraftHasChanges(menuWorkspace)) {
      setMenuUnsavedTarget(target ?? '__back__');
      return;
    }
    void openMenuWorkspace(target);
  };

  const resolveUnsavedMenuChange = async (action) => {
    const target = menuUnsavedTarget === '__back__' ? null : menuUnsavedTarget;
    const currentKind = menuKindForWorkspace(menuWorkspace);
    if (action === 'save') {
      const saved = await handleSaveDigitalMenu(currentKind);
      if (!saved) return;
    }
    if (action === 'discard') {
      const menuState = getMenuDraftState(currentKind);
      // Reloading the stored state avoids retaining a discarded in-memory draft.
      const stored = isOnboardingMode
        ? currentKind === 'lunch'
          ? restaurant?.onboardingDraft?.lunchMenu
          : restaurant?.onboardingDraft?.digitalMenu
        : currentKind === 'lunch'
        ? await getRestaurantLunchMenu()
        : await getRestaurantDigitalMenu();
      menuState.setDraft(buildDigitalMenuDraft(stored || emptyDigitalMenuDraft, { lunchMode: currentKind === 'lunch' }));
      menuState.setDirty(false);
      menuState.setError('');
      menuState.setStatus('Ungespeicherte Änderungen wurden verworfen.');
    }
    setMenuUnsavedTarget(null);
    void openMenuWorkspace(target);
  };

  useEffect(() => () => clearMenuUndoTimer(), []);

  const openMenuItemEditor = (item = null, kind = 'normal') => {
    const defaultSlot = kind === 'lunch' ? 'lunch' : profileSlotList[0] || DEFAULT_MEAL_SLOT;
    setMenuItemEditorKind(kind);
    setMenuItemOfferMealSlot(defaultSlot);
    setMenuItemOfferPreorderEnabled(false);
    setMenuItemOfferModalOpen(false);

    if (!item) {
      const fallbackSection = normalizeDigitalSectionTitle('', 'Normal');
      const defaultRange = buildLunchDateRangeFromSchedule({
        availableWeekdays: lunchWeekdayOrder,
        repeatWeekly: true
      });
      setMenuItemEditor({
        id: null,
        name: '',
        description: '',
        priceText: '',
        category: 'Normal',
        sectionTitle: fallbackSection,
        allergensText: '',
        availableWeekdays: [...lunchWeekdayOrder],
        repeatWeekly: true,
        activeWeekKey: null,
        schedulePending: false,
        scheduleMode: 'weekdays',
        validFrom: null,
        validUntil: null,
        validityFromDate: defaultRange.fromDate,
        validityToDate: defaultRange.toDate,
        active: true
      });
      setMenuItemEditorOpen(true);
      return;
    }

    const normalizedCategory = normalizeDraftCategory(item.category, item.section, item.name, item.description);
    const schedule = deriveLunchSchedule(item, { allowPending: kind === 'lunch' });
    const validityRange = buildLunchDateRangeFromSchedule(schedule);
    setMenuItemEditor({
      id: item.id || null,
      name: item.name || '',
      description: item.description || '',
      priceText: toPriceText(item.priceText || item.price),
      category: normalizedCategory,
      sectionTitle: normalizeDigitalSectionTitle(item.section, normalizedCategory),
      allergensText: normalizeAllergenList(item.allergens).join('\n'),
      availableWeekdays: schedule.availableWeekdays,
      repeatWeekly: schedule.repeatWeekly,
      activeWeekKey: schedule.activeWeekKey,
      schedulePending: schedule.schedulePending,
      scheduleMode: schedule.scheduleMode,
      validFrom: schedule.validFrom,
      validUntil: schedule.validUntil,
      validityFromDate: validityRange.fromDate,
      validityToDate: validityRange.toDate,
      active: item?.active === undefined ? true : Boolean(item.active)
    });
    const itemMatchKey = toOfferMatchKey(item?.name, item?.priceText || item?.price);
    if (itemMatchKey) {
      const matchingOffers = restaurantOffers.filter(
        (offer) => toOfferMatchKey(offer.title, offer.price) === itemMatchKey
      );
      const preferredOffer =
        matchingOffers.find((offer) => offer.active !== false) || matchingOffers[0] || null;
      if (preferredOffer?.mealSlot) {
        setMenuItemOfferMealSlot(preferredOffer.mealSlot);
      }
      setMenuItemOfferPreorderEnabled(Boolean(preferredOffer?.preorderEnabled));
    }
    if (kind === 'lunch') {
      setMenuItemOfferMealSlot('lunch');
    }
    setMenuItemEditorOpen(true);
  };

  const closeMenuItemEditor = () => {
    Keyboard.dismiss();
    setMenuItemEditorOpen(false);
    setMenuItemOfferModalOpen(false);
  };

  const returnFromOfferModalToEditor = () => {
    setMenuItemOfferModalOpen(false);
    requestAnimationFrame(() => {
      setMenuItemEditorOpen(true);
    });
  };

  const openMenuItemOfferModal = () => {
    const menuState = getMenuDraftState(menuItemEditorKind);
    const name = String(menuItemEditor.name || '').trim();
    const itemPrice = normalizePriceInput(menuItemEditor.priceText);
    if (!name || itemPrice === null) {
      const message = 'Bitte zuerst Name und Preis eintragen.';
      menuState.setError(message);
      Alert.alert('Angebot übernehmen', message);
      return;
    }
    menuState.setError('');
    Keyboard.dismiss();
    setMenuItemEditorOpen(false);
    requestAnimationFrame(() => {
      setMenuItemOfferModalOpen(true);
    });
  };

  const updateMenuItemEditorField = (field, value) => {
    setMenuItemEditor((prev) => ({
      ...prev,
      [field]: value
    }));
  };

  const toggleMenuItemEditorAllergen = (allergen) => {
    setMenuItemEditor((prev) => {
      const current = normalizeAllergenList(prev.allergensText);
      const next = current.includes(allergen)
        ? current.filter((entry) => entry !== allergen)
        : [...current, allergen];
      return {
        ...prev,
        allergensText: next.join('\n')
      };
    });
  };

  const toggleMenuItemEditorWeekday = (weekdayKey) => {
    setMenuItemEditor((prev) => {
      const current = normalizeLunchMenuWeekdays(prev.availableWeekdays);
      const next = current.includes(weekdayKey)
        ? current.filter((entry) => entry !== weekdayKey)
        : [...current, weekdayKey];
      const normalizedWeekdays = normalizeLunchMenuWeekdays(next);
      return {
        ...prev,
        availableWeekdays: normalizedWeekdays,
        repeatWeekly: true,
        activeWeekKey: null,
        schedulePending: false,
        scheduleMode: 'weekdays',
        validFrom: null,
        validUntil: null
      };
    });
  };

  const openLunchValidityEditor = (applyMode = 'all', draft = lunchMenuDraft, saveAfterApply = false) => {
    const summary = getLunchMenuValiditySummary(draft?.items);
    const configuredItem = (draft?.items || []).find((item) => item?.schedulePending !== true);
    const baseSchedule = summary.commonSchedule || configuredItem || {
      scheduleMode: 'openingHours',
      availableWeekdays: []
    };
    const schedule = deriveLunchSchedule(baseSchedule, { allowPending: true });
    const suggestion = normalizeLunchValiditySuggestion(draft?.lunchValidity);
    const range = schedule.scheduleMode === 'dateRange'
      ? { fromDate: schedule.validFrom || '', toDate: schedule.validUntil || '' }
      : suggestion.type === 'dateRange'
      ? { fromDate: suggestion.validFrom || '', toDate: suggestion.validUntil || '' }
      : { fromDate: '', toDate: '' };
    const suggestionType =
      suggestion.type !== 'none'
        ? suggestion.type
        : schedule.scheduleMode === 'weekdays'
        ? 'weekdays'
        : schedule.scheduleMode === 'dateRange'
        ? 'dateRange'
        : 'none';
    setLunchValidityEditor({
      open: true,
      applyMode,
      fromDate: range.fromDate,
      toDate: range.toDate,
      weekdays:
        suggestionType === 'weekdays'
          ? normalizeLunchMenuWeekdays(
              suggestion.type === 'weekdays' ? suggestion.weekdays : schedule.availableWeekdays
            )
          : [],
      suggestionType,
      detectedByAi: suggestion.type !== 'none',
      saveAfterApply,
      error: ''
    });
  };

  const closeLunchValidityEditor = () => {
    setLunchValidityEditor(createLunchValidityEditorState());
  };

  const applyLunchValidityToDraft = async ({ useOpeningHours = false } = {}) => {
    const schedule = useOpeningHours
      ? {
          scheduleMode: 'openingHours',
          validFrom: null,
          validUntil: null,
          availableWeekdays: [],
          repeatWeekly: true,
          activeWeekKey: null,
          schedulePending: false
        }
      : lunchValidityEditor.suggestionType === 'weekdays'
      ? {
          scheduleMode: 'weekdays',
          validFrom: null,
          validUntil: null,
          availableWeekdays: normalizeLunchMenuWeekdays(lunchValidityEditor.weekdays),
          repeatWeekly: true,
          activeWeekKey: null,
          schedulePending: false,
          ...(normalizeLunchMenuWeekdays(lunchValidityEditor.weekdays).length
            ? {}
            : { error: 'Bitte mindestens einen Wochentag auswählen.' })
        }
      : buildLunchScheduleFromDateRange(lunchValidityEditor.fromDate, lunchValidityEditor.toDate);
    if (schedule.error) {
      setLunchValidityEditor((prev) => ({ ...prev, error: schedule.error }));
      return;
    }

    const nextItems = (lunchMenuDraft.items || []).map((item) => ({ ...item, ...schedule }));
    setLunchMenuDraft((prev) => ({ ...prev, items: nextItems }));
    setLunchMenuDirty(true);
    setLunchMenuError('');
    setLunchValidityReviewRequired(false);
    const saveAfterApply = lunchValidityEditor.saveAfterApply;
    closeLunchValidityEditor();
    if (saveAfterApply) {
      await persistDigitalMenuDraft('lunch', nextItems);
      return;
    }
    setLunchMenuStatus('Zeitraum übernommen. Bitte die Mittagstisch-Karte speichern.');
  };

  const applyMenuItemValidityRange = () => {
    const schedule = buildLunchScheduleFromDateRange(
      menuItemEditor.validityFromDate,
      menuItemEditor.validityToDate
    );
    if (schedule.error) {
      getMenuDraftState('lunch').setError(schedule.error);
      return;
    }
    setMenuItemEditor((prev) => ({
      ...prev,
      ...schedule
    }));
    getMenuDraftState('lunch').setError('');
  };

  const setLunchDatePickerValue = (target, field, date) => {
    const dateText = toIsoDateText(date);
    if (target === 'item') {
      setMenuItemEditor((prev) => ({ ...prev, [`validity${field === 'fromDate' ? 'From' : 'To'}Date`]: dateText }));
      return;
    }
    setLunchValidityEditor((prev) => ({ ...prev, [field]: dateText, error: '' }));
  };

  const openLunchDatePicker = (target, field) => {
    const valueText =
      target === 'item'
        ? field === 'fromDate'
          ? menuItemEditor.validityFromDate
          : menuItemEditor.validityToDate
        : lunchValidityEditor[field];
    const parsed = parseLunchIsoDate(valueText) || new Date();
    setLunchDatePickerState({ visible: true, target, field, value: parsed });
  };

  const closeLunchDatePicker = () => {
    setLunchDatePickerState((prev) => ({ ...prev, visible: false }));
  };

  const handleLunchDatePickerChange = (event, selectedDate) => {
    if (Platform.OS === 'android') {
      if (event?.type !== 'dismissed' && selectedDate) {
        setLunchDatePickerValue(lunchDatePickerState.target, lunchDatePickerState.field, selectedDate);
      }
      closeLunchDatePicker();
      return;
    }
    if (selectedDate) {
      setLunchDatePickerState((prev) => ({ ...prev, value: selectedDate }));
    }
  };

  const confirmLunchDatePicker = () => {
    setLunchDatePickerValue(
      lunchDatePickerState.target,
      lunchDatePickerState.field,
      lunchDatePickerState.value
    );
    closeLunchDatePicker();
  };

  const saveMenuItemEditor = () => {
    const menuState = getMenuDraftState(menuItemEditorKind);
    const name = String(menuItemEditor.name || '').trim();
    const price = normalizePriceInput(menuItemEditor.priceText);
    if (!name || price === null) {
      menuState.setError('Bitte Name und gültigen Preis eingeben.');
      return;
    }

    const lunchSchedule = deriveLunchSchedule({
      availableWeekdays: menuItemEditor.availableWeekdays,
      repeatWeekly: menuItemEditor.repeatWeekly,
      activeWeekKey: menuItemEditor.activeWeekKey,
      schedulePending: menuItemEditor.schedulePending,
      scheduleMode: menuItemEditor.scheduleMode,
      validFrom: menuItemEditor.validFrom,
      validUntil: menuItemEditor.validUntil
    }, { allowPending: menuItemEditorKind === 'lunch' });

    const nextItem = {
      id: menuItemEditor.id || createDraftId(),
      name,
      description: String(menuItemEditor.description || '').trim(),
      priceText: price.toFixed(2).replace('.', ','),
      category: normalizeDraftCategory(
        menuItemEditor.category,
        menuItemEditor.sectionTitle,
        name,
        menuItemEditor.description
      ),
      section: normalizeDigitalSectionTitle(menuItemEditor.sectionTitle, menuItemEditor.category),
      allergens: normalizeAllergenList(menuItemEditor.allergensText).slice(0, 20),
      availableWeekdays: menuItemEditorKind === 'lunch' ? lunchSchedule.availableWeekdays : [],
      repeatWeekly: menuItemEditorKind === 'lunch' ? lunchSchedule.repeatWeekly : true,
      activeWeekKey:
        menuItemEditorKind === 'lunch'
          ? lunchSchedule.repeatWeekly
            ? null
            : lunchSchedule.activeWeekKey
          : null,
      schedulePending: menuItemEditorKind === 'lunch' ? false : undefined,
      scheduleMode: menuItemEditorKind === 'lunch' ? lunchSchedule.scheduleMode || 'weekdays' : undefined,
      validFrom: menuItemEditorKind === 'lunch' ? lunchSchedule.validFrom : undefined,
      validUntil: menuItemEditorKind === 'lunch' ? lunchSchedule.validUntil : undefined,
      active: menuItemEditorKind === 'lunch' ? Boolean(menuItemEditor.active) : true
    };

    menuState.setDraft((prev) => {
      const hasExisting = prev.items.some((item) => item.id === nextItem.id);
      if (hasExisting) {
        return {
          ...prev,
          items: prev.items.map((item) => (item.id === nextItem.id ? nextItem : item))
        };
      }
      return {
        ...prev,
        items: [...prev.items, nextItem]
      };
    });

    menuState.setError('');
    menuState.setStatus(
      menuItemEditorKind === 'lunch'
        ? 'Mittagstisch-Gericht aktualisiert (noch nicht gespeichert).'
        : 'Gericht aktualisiert (noch nicht gespeichert).'
    );
    menuState.setDirty(true);
    Keyboard.dismiss();
    setMenuItemEditorOpen(false);
  };

  const deleteMenuItemEditor = () => {
    if (!menuItemEditor.id) {
      Keyboard.dismiss();
      setMenuItemEditorOpen(false);
      return;
    }
    Keyboard.dismiss();
    setMenuItemEditorOpen(false);
    setMenuDeleteConfirmKind({ type: 'item', kind: menuItemEditorKind, item: { ...menuItemEditor } });
  };

  const handleTakeMenuItemAsOffer = async () => {
    const menuState = getMenuDraftState(menuItemEditorKind);
    const name = String(menuItemEditor.name || '').trim();
    const description = String(menuItemEditor.description || '').trim();
    const price = normalizePriceInput(menuItemEditor.priceText);
    if (!name || price === null) {
      menuState.setError('Bitte Name und gültigen Preis eingeben.');
      return;
    }

    const baseTags = tagsForDigitalCategory(menuItemEditor.category);
    const inferredOfferType = inferOfferTypeFromText(name, description);
    const tags = ensureOfferTypeTag(baseTags, inferredOfferType);
    const mealSlot = menuItemOfferMealSlot || DEFAULT_MEAL_SLOT;
    const enabled = await ensureOfferMealSlotEnabled(mealSlot);
    if (!enabled) {
      const message = 'Bereich konnte nicht aktiviert werden.';
      menuState.setError(message);
      Alert.alert('Angebot übernehmen', message);
      return;
    }
    const payload = {
      title: name,
      description: description || 'Keine Beschreibung',
      price,
      tags,
      mealSlot,
      preorderEnabled: Boolean(menuItemOfferPreorderEnabled),
      active: true
    };

    const matchKey = toOfferMatchKey(name, price);
    const existingOffer = restaurantOffers.find(
      (offer) =>
        toOfferMatchKey(offer.title, offer.price) === matchKey && offer.mealSlot === mealSlot
    );

    const ok = existingOffer
      ? await updateRestaurantOffer(existingOffer.id, payload)
      : await createRestaurantOffer(payload);

    if (!ok) {
      const message = restaurantError || 'Als Angebot übernehmen fehlgeschlagen.';
      menuState.setError(message);
      Alert.alert('Angebot übernehmen', message);
      return;
    }

    menuState.setError('');
    menuState.setStatus(
      existingOffer ? 'Angebot wurde aktualisiert.' : 'Gericht wurde direkt als Angebot übernommen.'
    );
    setMenuItemOfferModalOpen(false);
    setMenuItemEditorOpen(false);
    setActivePanel('myOffers');
  };

  const handleDeactivateMenuItemOffer = async () => {
    const menuState = getMenuDraftState(menuItemEditorKind);
    const name = String(menuItemEditor.name || '').trim();
    const price = normalizePriceInput(menuItemEditor.priceText);
    if (!name || price === null) {
      menuState.setError('Bitte Name und gültigen Preis eingeben.');
      return;
    }

    const targetSlot = menuItemOfferMealSlot || DEFAULT_MEAL_SLOT;
    const matchKey = toOfferMatchKey(name, price);
    const allMatchingActiveOffers = restaurantOffers.filter(
      (offer) =>
        offer.active !== false &&
        toOfferMatchKey(offer.title, offer.price) === matchKey
    );
    const offersForSelectedSlot = allMatchingActiveOffers.filter(
      (offer) => offer.mealSlot === targetSlot
    );
    const targetOffers = offersForSelectedSlot.length
      ? offersForSelectedSlot
      : allMatchingActiveOffers;

    if (!targetOffers.length) {
      menuState.setError('');
      menuState.setStatus('Kein aktives Angebot für diesen Bereich gefunden.');
      return;
    }

    let changedCount = 0;
    for (const offer of targetOffers) {
      const ok = await updateRestaurantOffer(offer.id, { active: false });
      if (!ok) {
        menuState.setError('Angebot konnte nicht rückgängig gemacht werden.');
        return;
      }
      changedCount += 1;
    }

    menuState.setError('');
    const baseLabel =
      menuItemEditorKind === 'lunch' ? 'Gericht bleibt in der Mittagstisch-Karte.' : 'Gericht bleibt im Digital-Menü.';
    menuState.setStatus(
      changedCount > 1
        ? `${changedCount} Angebote wurden offline gestellt. ${baseLabel}`
        : `Angebot wurde offline gestellt. ${baseLabel}`
    );
  };

  const groupedDigitalMenu = useMemo(() => {
    const sectionMap = new Map();
    (digitalMenuDraft.items || []).forEach((item) => {
      const category = normalizeDraftCategory(item.category, item.section, item.name, item.description);
      if (digitalMenuDietFilter === 'all' && category === 'Getränke') return;
      if (digitalMenuDietFilter === 'vegan' && category !== 'Vegan') return;
      if (digitalMenuDietFilter === 'vegetarian' && category !== 'Vegetarisch') return;
      if (digitalMenuDietFilter === 'drinks' && category !== 'Getränke') return;

      const section = normalizeDigitalSectionTitle(item.section, category);
      if (!sectionMap.has(section)) {
        sectionMap.set(section, []);
      }
      sectionMap.get(section).push({
        ...item,
        category,
        section
      });
    });

    return Array.from(sectionMap.entries()).map(([section, items]) => ({
      section,
      items
    }));
  }, [digitalMenuDraft.items, digitalMenuDietFilter]);
  const hasRecognizedDigitalMenuItems = Array.isArray(digitalMenuDraft.items) && digitalMenuDraft.items.length > 0;
  const groupedBreakfastMenu = useMemo(() => {
    const sectionMap = new Map();
    (digitalMenuDraft.items || []).forEach((item) => {
      const category = normalizeDraftCategory(item.category, item.section, item.name, item.description);
      const section = normalizeDigitalSectionTitle(item.section, category);
      const breakfastText = `${section} ${item.name || ''}`.toLowerCase();
      if (!/(früh|frueh|breakfast|brunch)/.test(breakfastText)) return;
      if (digitalMenuDietFilter === 'all' && category === 'Getränke') return;
      if (digitalMenuDietFilter === 'vegan' && category !== 'Vegan') return;
      if (digitalMenuDietFilter === 'vegetarian' && category !== 'Vegetarisch') return;
      if (digitalMenuDietFilter === 'drinks' && category !== 'Getränke') return;
      if (!sectionMap.has(section)) sectionMap.set(section, []);
      sectionMap.get(section).push({ ...item, category, section });
    });
    return Array.from(sectionMap.entries()).map(([section, items]) => ({ section, items }));
  }, [digitalMenuDraft.items, digitalMenuDietFilter]);
  const groupedLunchMenu = useMemo(() => {
    const sectionMap = new Map();
    (lunchMenuDraft.items || []).forEach((item) => {
      const category = normalizeDraftCategory(item.category, item.section, item.name, item.description);
      if (lunchMenuDietFilter === 'all' && category === 'Getränke') return;
      if (lunchMenuDietFilter === 'vegan' && category !== 'Vegan') return;
      if (lunchMenuDietFilter === 'vegetarian' && category !== 'Vegetarisch') return;
      if (lunchMenuDietFilter === 'drinks' && category !== 'Getränke') return;

      const section = normalizeDigitalSectionTitle(item.section, category);
      if (!sectionMap.has(section)) {
        sectionMap.set(section, []);
      }
      sectionMap.get(section).push({
        ...item,
        category,
        section,
        ...deriveLunchSchedule(item, { allowPending: true }),
        active: item?.active === undefined ? true : Boolean(item.active)
      });
    });

    return Array.from(sectionMap.entries()).map(([section, items]) => ({
      section,
      items
    }));
  }, [lunchMenuDraft.items, lunchMenuDietFilter]);
  const hasRecognizedLunchMenuItems = Array.isArray(lunchMenuDraft.items) && lunchMenuDraft.items.length > 0;
  const lunchValiditySummary = useMemo(
    () => getLunchMenuValiditySummary(lunchMenuDraft.items),
    [lunchMenuDraft.items]
  );
  const hasExistingDigitalMenu = hasRecognizedDigitalMenuItems;
  const menuPrimaryTitle = hasExistingDigitalMenu
    ? 'Menü öffnen'
    : 'Start hier: Menü mit KI erstellen';
  const menuPrimaryDescription = hasExistingDigitalMenu
    ? 'Dein digitales Menü ist bereits vorhanden. Öffne es und bearbeite bei Bedarf deine Gerichte.'
    : 'Schnellster Weg. Aus Bild oder PDF wird automatisch ein digitales Menü mit einzelnen Gerichten.';
  const menuPrimaryInfoText = hasExistingDigitalMenu
    ? 'Öffne dein digitales Menü, prüfe die Gerichte und speichere deine Änderungen.'
    : 'Empfohlen: Lade ein Foto oder PDF hoch und prüfe danach die automatisch erkannten Gerichte.';
  const onboardingAssistantTitle = hasExistingDigitalMenu
    ? 'Menü öffnen'
    : 'Zuerst Einstellungen, dann Menü mit KI erstellen';
  const onboardingAssistantIntro = hasExistingDigitalMenu
    ? 'Dein digitales Menü ist bereits vorhanden. Du kannst es jetzt direkt öffnen und bearbeiten.'
    : 'Prüfe zuerst kurz deine Einstellungen. Danach erstellst du dein Menü mit KI aus Bild oder PDF.';
  const onboardingAssistantActionLabel = hasExistingDigitalMenu
    ? 'Menü öffnen'
    : 'Dann Menü mit KI erstellen';

  const activeOfferKeySet = useMemo(() => {
    const set = new Set();
    (restaurantOffers || []).forEach((offer) => {
      if (offer.active === false) return;
      const key = toOfferMatchKey(offer.title, offer.price);
      if (key) set.add(key);
    });
    return set;
  }, [restaurantOffers]);

  const isMenuItemMarkedAsOffer = (item) => {
    const key = toOfferMatchKey(item?.name, item?.priceText || item?.price);
    return key ? activeOfferKeySet.has(key) : false;
  };

  const menuFiles = isOnboardingMode
    ? Array.isArray(restaurant?.onboardingDraft?.menuFiles)
      ? restaurant.onboardingDraft.menuFiles.filter((entry) => entry?.url)
      : []
    : Array.isArray(restaurant?.menuFiles)
    ? restaurant.menuFiles.filter((entry) => entry?.url)
    : [];
  const latestMenuFile = menuFiles[0] || null;
  const hasUploadedMenu = menuFiles.length > 0;
  const uploadedLunchMenuFiles = isOnboardingMode
    ? Array.isArray(restaurant?.onboardingDraft?.lunchMenuFiles)
      ? restaurant.onboardingDraft.lunchMenuFiles.filter((entry) => entry?.url)
      : []
    : Array.isArray(restaurant?.lunchMenuFiles)
    ? restaurant.lunchMenuFiles.filter((entry) => entry?.url)
    : [];
  const pendingOrdersCount = (restaurantOrders || []).filter((entry) => entry.status === 'pending').length;
  const pendingReservationsCount = (restaurantReservations || []).filter(
    (entry) => entry.status === 'pending'
  ).length;
  const unreadReviewsCount = (restaurantReviews || []).filter((entry) => entry.isUnread).length;
  const activeOffersCount = (restaurantOffers || []).filter((entry) => entry.active !== false).length;
  const activeEventsCount = (restaurantEvents || []).filter((entry) => entry.active !== false).length;
  const activeCateringOffersCount = (restaurantCateringOffers || []).filter(
    (entry) => entry.active !== false
  ).length;

  const loadMenuAnalytics = async (range = menuAnalyticsRange) => {
    setMenuAnalyticsError('');
    try {
      const analytics = await getRestaurantMenuAnalytics(range);
      setMenuAnalytics(analytics || null);
    } catch (error) {
      setMenuAnalyticsError(error?.message || 'Aufrufe konnten nicht geladen werden.');
    }
  };

  const buildEventFormDefaults = ({ withDateDefaults = false } = {}) => ({
    ...emptyEventForm,
    ...(withDateDefaults ? createDefaultEventDateRange() : {}),
    venueName: restaurant?.name || '',
    address: restaurant?.address || '',
    postalCode: restaurant?.postalCode || '',
    contactUrl: restaurant?.eventProfile?.contactUrl || restaurant?.eventProfile?.reservationUrl || '',
    contactEmail: restaurant?.eventProfile?.contactEmail || '',
    // An event contact must be chosen explicitly; never copy the provider phone into an event.
    contactPhone: ''
  });
  const openPanel = (key) => {
    Keyboard.dismiss();
    if (key === 'support') {
      setSupportOpen(true);
      setSupportMode('start');
      setSupportChatMessages([]);
      setSupportChatInput('');
      setSupportChatError('');
      setGuideSupportMessage('');
      setGuideSupportStatus('');
      setGuideSupportError('');
      return;
    }
    if (key === 'events' && !restaurantEventsReady) {
      setStatus('Events sind noch nicht eingerichtet. In Einstellungen Anbieter-Typ Events aktivieren und speichern.');
      return;
    }
    setActivePanel(key);
    if (key === 'myMenu') {
      setMenuWorkspace(null);
      setMenuKiToolsOpen(false);
      setLunchMenuToolsOpen(false);
      setMenuPdfToolsOpen(false);
    }
    if (key === 'offers') {
      setOffersCreateOpen(false);
      setOffersListOpen(false);
      setEditingOffer(null);
      setTitle('');
      setPrice('');
      setDescription('');
      setOfferMealSlot(profileSlotList[0] || DEFAULT_MEAL_SLOT);
      setOfferType('normal');
      setIsVegan(false);
      setIsVegetarian(false);
      setPreorderEnabled(false);
      setImageUri(null);
      setImageAsset(null);
    }
    if (key === 'events') {
      setEventStatus('');
      setEventError('');
      setEventForm(buildEventFormDefaults());
      setEventFormOpen(false);
      void loadRestaurantEvents();
    }
    if (key === 'services') {
      setServicesDashboardTab(restaurantEventsReady || !cateringEnabled ? 'events' : 'catering');
      setCateringOfferFormOpen(false);
      setEditingCateringOffer(null);
      setCateringOfferStatus('');
      void loadRestaurantEvents();
      void loadRestaurantCateringOffers();
    }
    if (key === 'reviews') {
      void loadRestaurantReviews();
    }
    if (key === 'requests') {
      setRequestsTab('orders');
      void loadRestaurantOrders();
      void loadRestaurantReservations();
    }
    if (key === 'statistics') void loadMenuAnalytics();
    if (key === 'myMenu') {
      setDigitalMenuDietFilter('all');
      setMenuKiToolsOpen(false);
      setMenuPdfToolsOpen(false);
      setLunchMenuToolsOpen(false);
    } else {
      setMenuPdfToolsOpen(false);
      setMenuKiToolsOpen(false);
      setLunchMenuToolsOpen(false);
    }
    setTimeout(() => {
      scrollRef.current?.scrollTo?.({ y: 0, animated: true });
    }, 0);
  };

  const handleSaveReviewReply = async (review) => {
    if (!review?.id) return;
    const text = String(reviewReplyDrafts[review.id] || '').trim();
    const updated = await replyRestaurantReview(review.id, text);
    if (updated) {
      setStatus(text ? 'Antwort gespeichert.' : 'Antwort entfernt.');
      if (review.isUnread) {
        await markRestaurantReviewRead(review.id);
      }
    }
  };

  const handleMarkReviewRead = async (reviewId) => {
    if (!reviewId) return;
    const updated = await markRestaurantReviewRead(reviewId);
    if (updated) {
      setStatus('Bewertung als gelesen markiert.');
    }
  };

  const openReviewReport = (review) => {
    if (!reviewReportingEnabled || !review?.id || review.report) return;
    Keyboard.dismiss();
    setReviewReportTarget(review);
    setReviewReportReason('');
    setReviewReportNote('');
    setReviewReportError('');
  };

  const closeReviewReport = () => {
    if (reviewReportSending) return;
    setReviewReportTarget(null);
    setReviewReportReason('');
    setReviewReportNote('');
    setReviewReportError('');
  };

  const handleSubmitReviewReport = async () => {
    if (!reviewReportTarget?.id || reviewReportSending) return;
    if (!reviewReportReason) {
      setReviewReportError('Bitte einen Meldegrund auswählen.');
      return;
    }
    setReviewReportSending(true);
    setReviewReportError('');
    const updated = await reportRestaurantReview(reviewReportTarget.id, {
      reason: reviewReportReason,
      note: reviewReportNote.trim() || undefined
    });
    setReviewReportSending(false);
    if (!updated) {
      setReviewReportError('Bewertung konnte nicht gemeldet werden. Bitte erneut versuchen.');
      return;
    }
    setStatus('Bewertung gemeldet. Nah&Fein prüft sie.');
    setReviewReportTarget(null);
    setReviewReportReason('');
    setReviewReportNote('');
  };

  const getReviewModerationLabel = (review) => {
    if (review?.report?.status === 'pending') return 'Gemeldet · Prüfung läuft';
    if (review?.report?.status === 'removed' || review?.visibilityStatus === 'removed') {
      return 'Von Nah&Fein entfernt';
    }
    if (review?.report?.restoredAt) return 'Wiederhergestellt';
    if (review?.report?.status === 'kept') return 'Geprüft · bleibt online';
    return '';
  };

  const updateEventForm = (field, value) => {
    setEventForm((prev) => ({
      ...prev,
      [field]: value
    }));
  };

  const updateEventSocialLink = (index, field, value) => {
    setEventForm((prev) => ({
      ...prev,
      socialLinks: (Array.isArray(prev.socialLinks) ? prev.socialLinks : []).map((entry, itemIndex) =>
        itemIndex === index ? { ...entry, [field]: value } : entry
      )
    }));
  };

  const addEventSocialLink = () => {
    setEventForm((prev) => ({
      ...prev,
      socialLinks: [...(Array.isArray(prev.socialLinks) ? prev.socialLinks : []), { ...emptySocialLink }].slice(0, 8)
    }));
  };

  const removeEventSocialLink = (index) => {
    setEventForm((prev) => ({
      ...prev,
      socialLinks: (Array.isArray(prev.socialLinks) ? prev.socialLinks : []).filter(
        (_, itemIndex) => itemIndex !== index
      )
    }));
  };

  const scrollToEventForm = () => {
    eventFormScrollPendingRef.current = true;
    setTimeout(() => {
      if (eventFormYRef.current > 0) {
        scrollRef.current?.scrollTo?.({
          y: Math.max(0, eventFormYRef.current - spacing.md),
          animated: true
        });
        eventFormScrollPendingRef.current = false;
      }
    }, 120);
  };

  const handleEventFormLayout = (event) => {
    eventFormYRef.current = Number(event?.nativeEvent?.layout?.y || 0);
    if (eventFormScrollPendingRef.current && eventFormYRef.current > 0) {
      setTimeout(() => {
        scrollRef.current?.scrollTo?.({
          y: Math.max(0, eventFormYRef.current - spacing.md),
          animated: true
        });
        eventFormScrollPendingRef.current = false;
      }, 60);
    }
  };

  const resetEventForm = ({ close = true, withDateDefaults = false } = {}) => {
    setEventForm(buildEventFormDefaults({ withDateDefaults }));
    setEventStatus('');
    setEventError('');
    setEventDateTimePickerState((prev) => ({ ...prev, visible: false }));
    setEventSocialLinksOpen(false);
    if (close) setEventFormOpen(false);
  };

  const openCreateRestaurantEvent = () => {
    resetEventForm({ close: false, withDateDefaults: true });
    setEventFormOpen(true);
    scrollToEventForm();
  };

  const toggleEventFormTag = (tag) => {
    setEventForm((prev) => {
      const current = Array.isArray(prev.tags) ? prev.tags : [];
      if (current.includes(tag)) {
        const next = current.filter((entry) => entry !== tag);
        return {
          ...prev,
          tags: next,
          primaryTag: next.includes(prev.primaryTag) ? prev.primaryTag : next[0] || ''
        };
      }
      const next = [...current, tag].slice(0, 5);
      return {
        ...prev,
        tags: next,
        primaryTag: prev.primaryTag || tag
      };
    });
  };

  const applyEventRecurrenceType = (recurrenceType) => {
    setEventForm((prev) => {
      const startDate = eventInputTextToDate(prev.startAtText) || new Date();
      const fallbackWeekday = getEventWeekdayFromDate(startDate);
      const currentWeekdays = normalizeEventWeekdaysForEdit(prev.recurrenceWeekdays);
      const recurring = recurrenceType === 'weekly' || recurrenceType === 'monthly';
      return {
        ...prev,
        recurrenceType,
        recurrenceWeekdays: recurrenceType === 'weekly' ? currentWeekdays.length ? currentWeekdays : [fallbackWeekday] : [],
        recurrenceEndMode: recurring ? prev.recurrenceEndMode || 'open' : 'open',
        recurrenceEndAtText: recurring ? prev.recurrenceEndAtText : '',
        scheduledOccurrences: recurring ? [] : prev.scheduledOccurrences || []
      };
    });
  };

  const setEventRecurrenceType = (recurrenceType) => {
    const hasIndividualDates = Array.isArray(eventForm.scheduledOccurrences) && eventForm.scheduledOccurrences.length > 0;
    if (recurrenceType !== 'none' && hasIndividualDates) {
      Alert.alert(
        'Einzelne Termine entfernen?',
        'Beim Wechsel zur Wiederholung werden die zusätzlichen einzelnen Termine entfernt.',
        [
          { text: 'Abbrechen', style: 'cancel' },
          { text: 'Entfernen', style: 'destructive', onPress: () => applyEventRecurrenceType(recurrenceType) }
        ]
      );
      return;
    }
    applyEventRecurrenceType(recurrenceType);
  };

  const toggleEventFormWeekday = (weekday) => {
    setEventForm((prev) => {
      const current = normalizeEventWeekdaysForEdit(prev.recurrenceWeekdays);
      const next = current.includes(weekday)
        ? current.filter((entry) => entry !== weekday)
        : [...current, weekday];
      return {
        ...prev,
        recurrenceWeekdays: next
      };
    });
  };

  const updateEventScheduledOccurrence = (index, field, value) => {
    setEventForm((prev) => ({
      ...prev,
      scheduledOccurrences: (Array.isArray(prev.scheduledOccurrences) ? prev.scheduledOccurrences : []).map(
        (entry, itemIndex) => itemIndex === index ? { ...entry, [field]: value } : entry
      )
    }));
  };

  const removeEventScheduledOccurrence = (index) => {
    setEventForm((prev) => ({
      ...prev,
      scheduledOccurrences: (Array.isArray(prev.scheduledOccurrences) ? prev.scheduledOccurrences : []).filter(
        (_, itemIndex) => itemIndex !== index
      )
    }));
  };

  const openAdditionalEventDateTimePicker = (index, field, mode) => {
    const currentText = eventForm.scheduledOccurrences?.[index]?.[field] || '';
    const current = eventInputTextToDate(currentText) || new Date();
    if (Platform.OS === 'web' && typeof globalThis.prompt === 'function') {
      const currentValue = mode === 'date'
        ? toIsoDateText(current)
        : `${String(current.getHours()).padStart(2, '0')}:${String(current.getMinutes()).padStart(2, '0')}`;
      const raw = globalThis.prompt(mode === 'date' ? 'Datum im Format JJJJ-MM-TT' : 'Uhrzeit im Format HH:MM', currentValue);
      if (!raw) return;
      const selected = mode === 'date'
        ? new Date(`${raw.trim()}T12:00:00`)
        : timeTextToDate(raw.trim(), currentValue);
      if (Number.isNaN(selected.getTime())) return;
      updateEventScheduledOccurrence(index, field, mergeEventDateTimePart(currentText, selected, mode, current));
      return;
    }
    setEventDateTimePickerState({
      visible: true,
      field: 'additionalOccurrence',
      additionalIndex: index,
      additionalField: field,
      mode,
      value: current
    });
  };

  const addEventScheduledOccurrence = () => {
    setEventForm((prev) => ({
      ...prev,
      scheduledOccurrences: [
        ...(Array.isArray(prev.scheduledOccurrences) ? prev.scheduledOccurrences : []),
        { startAtText: '', endAtText: '' }
      ]
    }));
  };

  const openEventDateTimePicker = (field, mode) => {
    if (Platform.OS === 'web' && typeof globalThis.prompt === 'function') {
      const current = eventInputTextToDate(eventForm[field]) || new Date();
      const currentValue =
        mode === 'date'
          ? toIsoDateText(current)
          : `${String(current.getHours()).padStart(2, '0')}:${String(current.getMinutes()).padStart(2, '0')}`;
      const raw = globalThis.prompt(mode === 'date' ? 'Datum im Format JJJJ-MM-TT' : 'Uhrzeit im Format HH:MM', currentValue);
      if (!raw) return;
      const selected =
        mode === 'date'
          ? new Date(`${raw.trim()}T12:00:00`)
          : timeTextToDate(raw.trim(), `${String(current.getHours()).padStart(2, '0')}:${String(current.getMinutes()).padStart(2, '0')}`);
      if (Number.isNaN(selected.getTime())) return;
      setEventForm((prev) => ({
        ...prev,
        [field]: mergeEventDateTimePart(prev[field], selected, mode, current)
      }));
      return;
    }

    const existing = eventInputTextToDate(eventForm[field]);
    const fallback =
      field === 'endAtText'
        ? eventInputTextToDate(eventForm.startAtText) || new Date(Date.now() + 2 * 60 * 60 * 1000)
        : field === 'recurrenceEndAtText'
        ? eventInputTextToDate(eventForm.endAtText) || eventInputTextToDate(eventForm.startAtText) || new Date()
        : new Date();
    setEventDateTimePickerState({
      visible: true,
      field,
      additionalIndex: null,
      additionalField: null,
      mode,
      value: existing || fallback
    });
  };

  const closeEventDateTimePicker = () => {
    setEventDateTimePickerState((prev) => ({ ...prev, visible: false }));
  };

  const applyEventDateTimePickerValue = (date) => {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return;
    if (eventDateTimePickerState.field === 'additionalOccurrence') {
      const index = Number(eventDateTimePickerState.additionalIndex);
      const field = eventDateTimePickerState.additionalField;
      if (Number.isInteger(index) && index >= 0 && (field === 'startAtText' || field === 'endAtText')) {
        const currentText = eventForm.scheduledOccurrences?.[index]?.[field] || '';
        updateEventScheduledOccurrence(index, field, mergeEventDateTimePart(currentText, date, eventDateTimePickerState.mode));
      }
      return;
    }
    setEventForm((prev) => {
      const fallback =
        eventDateTimePickerState.field === 'endAtText'
          ? eventInputTextToDate(prev.startAtText) || new Date(Date.now() + 2 * 60 * 60 * 1000)
          : eventDateTimePickerState.field === 'recurrenceEndAtText'
          ? eventInputTextToDate(prev.endAtText) || eventInputTextToDate(prev.startAtText) || new Date()
          : new Date();
      return {
        ...prev,
        [eventDateTimePickerState.field]: mergeEventDateTimePart(
          prev[eventDateTimePickerState.field],
          date,
          eventDateTimePickerState.mode,
          fallback
        )
      };
    });
  };

  const handleEventDateTimePickerChange = (event, selectedDate) => {
    if (Platform.OS === 'android') {
      if (event?.type === 'set' && selectedDate) {
        applyEventDateTimePickerValue(selectedDate);
      }
      closeEventDateTimePicker();
      return;
    }

    if (selectedDate) {
      setEventDateTimePickerState((prev) => ({
        ...prev,
        value: selectedDate
      }));
    }
  };

  const confirmEventDateTimePicker = () => {
    applyEventDateTimePickerValue(eventDateTimePickerState.value);
    closeEventDateTimePicker();
  };

  const editRestaurantEvent = (event) => {
    setEventForm({
      id: event.id,
      title: event.title || '',
      description: event.description || '',
      tags: Array.isArray(event.tags) ? event.tags : [],
      primaryTag: event.primaryTag || event.tags?.[0] || '',
      venueName: event.venueName || '',
      address: event.address || '',
      postalCode: event.postalCode || '',
      startAtText: toEventInputText(event.startAt),
      endAtText: toEventInputText(event.endAt),
      scheduledOccurrences: (Array.isArray(event.scheduledOccurrences) ? event.scheduledOccurrences : [])
        .map((occurrence) => ({
          startAtText: toEventInputText(occurrence.startAt),
          endAtText: toEventInputText(occurrence.endAt)
        }))
        .filter((occurrence) => occurrence.startAtText && occurrence.endAtText),
      recurrenceType: event.recurrenceType === 'weekly' || event.recurrenceType === 'monthly'
        ? event.recurrenceType
        : 'none',
      recurrenceWeekdays: normalizeEventWeekdaysForEdit(event.recurrenceWeekdays),
      recurrenceEndMode: event.recurrenceEndAt ? 'until' : 'open',
      recurrenceEndAtText: event.recurrenceEndAt ? toEventInputText(event.recurrenceEndAt) : '',
      socialLinks: Array.isArray(event.socialLinks) ? event.socialLinks : [],
      imageUrl: event.imageUrl || '',
      ticketUrl: event.ticketUrl || '',
      contactUrl: event.contactUrl || '',
      contactEmail: event.contactEmail || '',
      contactPhone: event.contactPhone || '',
      active: event.active !== false
    });
    setEventStatus('');
    setEventError('');
    setEventSocialLinksOpen(false);
    setEventFormOpen(true);
    scrollToEventForm();
  };

  const handlePickEventImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.78,
        allowsEditing: true,
        legacy: false
      });
      if (result.canceled) return;
      const selected = result.assets?.[0];
      if (!selected) return;
      const imageUrl = await uploadRestaurantEventImage({
        uri: selected.uri,
        name: selected.fileName || `event-${Date.now()}.jpg`,
        mimeType: selected.mimeType || 'image/jpeg',
        file: selected.file
      });
      if (imageUrl) {
        updateEventForm('imageUrl', imageUrl);
        setEventStatus('Eventbild hochgeladen.');
      }
    } catch (error) {
      setEventError(error?.message || 'Eventbild konnte nicht geladen werden.');
    }
  };

  const handleSubmitRestaurantEvent = async () => {
    setEventStatus('');
    const tags = Array.isArray(eventForm.tags) ? eventForm.tags : [];
    const startAt = eventInputTextToIso(eventForm.startAtText);
    const endAt = eventInputTextToIso(eventForm.endAtText);
    if (!eventForm.title.trim() || !eventForm.description.trim()) {
      setEventError('Bitte Titel und Beschreibung eingeben.');
      return;
    }
    if (!tags.length) {
      setEventError('Bitte mindestens einen Hashtag auswählen.');
      return;
    }
    if (!startAt || !endAt) {
      setEventError('Bitte Startdatum, Startzeit, Enddatum und Endzeit wählen.');
      return;
    }
    if (Date.parse(endAt) <= Date.parse(startAt)) {
      setEventError('Das Ende muss nach dem Start liegen.');
      return;
    }
    const recurrenceType = eventForm.recurrenceType === 'weekly' || eventForm.recurrenceType === 'monthly'
      ? eventForm.recurrenceType
      : 'none';
    const recurrenceWeekdays =
      recurrenceType === 'weekly' ? normalizeEventWeekdaysForEdit(eventForm.recurrenceWeekdays) : [];
    const recurrenceEndAt =
      recurrenceType !== 'none' && eventForm.recurrenceEndMode === 'until'
        ? eventInputTextToEndOfDayIso(eventForm.recurrenceEndAtText)
        : null;
    if (recurrenceType === 'weekly' && !recurrenceWeekdays.length) {
      setEventError('Bitte mindestens einen Wochentag für die Wiederholung wählen.');
      return;
    }
    if (recurrenceType !== 'none' && eventForm.recurrenceEndMode === 'until' && !recurrenceEndAt) {
      setEventError('Bitte ein gültiges Enddatum für die Wiederholung wählen.');
      return;
    }
    if (recurrenceEndAt && Date.parse(recurrenceEndAt) < Date.parse(startAt)) {
      setEventError('Das Wiederholungs-Ende muss nach dem Start liegen.');
      return;
    }
    const additionalOccurrences = recurrenceType === 'none' && Array.isArray(eventForm.scheduledOccurrences)
      ? eventForm.scheduledOccurrences
      : [];
    const seenOccurrenceStarts = new Set([startAt]);
    const scheduledOccurrences = [];
    for (const occurrence of additionalOccurrences) {
      const occurrenceStartAt = eventInputTextToIso(occurrence?.startAtText);
      const occurrenceEndAt = eventInputTextToIso(occurrence?.endAtText);
      if (!occurrenceStartAt || !occurrenceEndAt) {
        setEventError('Bitte Start und Ende für jeden zusätzlichen Termin wählen.');
        return;
      }
      if (Date.parse(occurrenceEndAt) <= Date.parse(occurrenceStartAt)) {
        setEventError('Das Ende jedes zusätzlichen Termins muss nach dem Start liegen.');
        return;
      }
      if (seenOccurrenceStarts.has(occurrenceStartAt)) {
        setEventError('Jeder Termin darf nur einmal vorkommen.');
        return;
      }
      seenOccurrenceStarts.add(occurrenceStartAt);
      scheduledOccurrences.push({
        startAt: occurrenceStartAt,
        endAt: occurrenceEndAt
      });
    }
    const socialLinksResult = prepareSocialLinksPayload(eventForm.socialLinks);
    if (socialLinksResult.error) {
      setEventError(socialLinksResult.error);
      return;
    }

    setEventError('');
    const payload = {
      title: eventForm.title.trim(),
      description: eventForm.description.trim(),
      tags,
      primaryTag: eventForm.primaryTag || tags[0],
      venueName: eventForm.venueName.trim() || restaurant?.name || 'Event',
      address: eventForm.address.trim() || restaurant?.address || '',
      postalCode: eventForm.postalCode.trim() || restaurant?.postalCode || '',
      startAt,
      endAt,
      recurrenceType,
      recurrenceWeekdays,
      recurrenceEndAt,
      scheduledOccurrences,
      socialLinks: socialLinksResult.links.slice(0, 8),
      imageUrl: eventForm.imageUrl.trim(),
      ticketUrl: eventForm.ticketUrl.trim(),
      contactUrl: eventForm.contactUrl.trim(),
      contactEmail: eventForm.contactEmail.trim(),
      contactPhone: eventForm.contactPhone.trim(),
      active: Boolean(eventForm.active)
    };
    const saved = eventForm.id
      ? await updateRestaurantEvent(eventForm.id, payload)
      : await createRestaurantEvent(payload);
    if (saved) {
      const message = eventForm.id ? 'Event aktualisiert.' : 'Event erstellt.';
      resetEventForm();
      setEventStatus(message);
    } else {
      setEventError('Event konnte nicht gespeichert werden.');
    }
  };

  const handleDeleteRestaurantEvent = async (eventId) => {
    const ok = await removeRestaurantEvent(eventId);
    if (ok) {
      if (eventForm.id === eventId) {
        resetEventForm();
      }
      setEventStatus('Event gelöscht.');
    }
  };

  const toggleEventOccurrenceManager = (eventId) => {
    setEventOccurrenceOpenIds((prev) =>
      prev.includes(eventId) ? prev.filter((entry) => entry !== eventId) : [...prev, eventId]
    );
  };

  const handleCancelEventOccurrence = async (eventId, occurrenceStartAt) => {
    const draftKey = `${eventId}:${occurrenceStartAt}`;
    setEventError('');
    const ok = await cancelRestaurantEventOccurrence(
      eventId,
      occurrenceStartAt,
      String(eventCancellationReasonDrafts[draftKey] || '').trim()
    );
    if (ok) {
      setEventCancellationReasonDrafts((prev) => ({ ...prev, [draftKey]: '' }));
      setEventStatus('Dieser einzelne Termin wurde abgesagt. Die Event-Serie bleibt aktiv.');
    } else {
      setEventError('Termin konnte nicht abgesagt werden.');
    }
  };

  const handleRestoreEventOccurrence = async (eventId, cancellationId) => {
    setEventError('');
    const ok = await restoreRestaurantEventOccurrence(eventId, cancellationId);
    if (ok) {
      setEventStatus('Die Terminabsage wurde aufgehoben.');
    } else {
      setEventError('Absage konnte nicht aufgehoben werden.');
    }
  };

  const getRestaurantEventVisibilityStatus = (event) => {
    const now = Date.now();
    const endTime = Date.parse(event?.endAt || '');
    const recurrenceEndTime = Date.parse(event?.recurrenceEndAt || '');
    const isRecurring = event?.recurrenceType === 'weekly' || event?.recurrenceType === 'monthly';
    const hasFutureIndividualOccurrence = Array.isArray(event?.scheduledOccurrences) && event.scheduledOccurrences.some(
      (occurrence) => Date.parse(occurrence?.endAt || '') >= now
    );
    if (event?.active === false) {
      return { visible: false, text: 'Nicht öffentlich: deaktiviert' };
    }
    if (!Number.isFinite(endTime)) {
      return { visible: false, text: 'Nicht öffentlich: Datum fehlt' };
    }
    if (isRecurring && Number.isFinite(recurrenceEndTime) && recurrenceEndTime < now) {
      return { visible: false, text: 'Nicht öffentlich: Wiederholung abgelaufen' };
    }
    if (!isRecurring && endTime < now && !hasFutureIndividualOccurrence) {
      return { visible: false, text: 'Nicht öffentlich: abgelaufen' };
    }
    if (restaurant?.approvalStatus && restaurant.approvalStatus !== 'approved') {
      return { visible: false, text: 'Nicht öffentlich: Anbieter nicht freigegeben' };
    }
    if (!Number.isFinite(Number(event?.lat)) || !Number.isFinite(Number(event?.lng))) {
      return { visible: false, text: 'Nicht öffentlich: Adresse/PLZ prüfen' };
    }
    return { visible: true, text: 'Öffentlich sichtbar' };
  };

  const goToDashboard = () => {
    setActivePanel(null);
    setMenuWorkspace(null);
    setOffersCreateOpen(false);
    setOffersListOpen(false);
    setMenuPdfToolsOpen(false);
    setMenuKiToolsOpen(false);
    setLunchMenuToolsOpen(false);
    setTimeout(() => {
      scrollRef.current?.scrollTo?.({ y: 0, animated: true });
    }, 0);
  };

  const openMenuWorkspace = async (kind) => {
    setMenuWorkspace(kind || null);
    setMenuAnalyticsError('');
    if (!kind || (kind !== 'regular' && kind !== 'breakfast' && kind !== 'lunch')) return;
    try {
      const analytics = await getRestaurantMenuAnalytics();
      setMenuAnalytics(analytics || null);
    } catch (error) {
      setMenuAnalyticsError(error?.message || 'Aufrufe konnten nicht geladen werden.');
    }
  };

  const openMenuAnalytics = (kind) => {
    setMenuAnalyticsKind(['regular', 'lunch', 'offers', 'dishes', 'events'].includes(kind) ? kind : 'regular');
    setMenuAnalyticsOpen(true);
    void loadMenuAnalytics(menuAnalyticsRange);
  };

  const applyMenuAnalyticsDate = (field, selectedDate) => {
    const dateText = toIsoDateText(selectedDate);
    const next = { ...menuAnalyticsRange, [field]: dateText };
    if (next.from > next.to) {
      if (field === 'from') next.to = dateText;
      else next.from = dateText;
    }
    setMenuAnalyticsRange(next);
    void loadMenuAnalytics(next);
  };

  const openMenuAnalyticsDatePicker = (field) => {
    setMenuAnalyticsDatePickerState({
      visible: true,
      field,
      value: parseMenuAnalyticsDate(menuAnalyticsRange[field])
    });
  };

  const closeMenuAnalyticsDatePicker = () => {
    setMenuAnalyticsDatePickerState((current) => ({ ...current, visible: false }));
  };

  const handleMenuAnalyticsDatePickerChange = (event, selectedDate) => {
    if (Platform.OS === 'android') {
      if (event?.type !== 'dismissed' && selectedDate) {
        applyMenuAnalyticsDate(menuAnalyticsDatePickerState.field, selectedDate);
      }
      closeMenuAnalyticsDatePicker();
      return;
    }
    if (selectedDate) {
      setMenuAnalyticsDatePickerState((current) => ({ ...current, value: selectedDate }));
    }
  };

  const confirmMenuAnalyticsDatePicker = () => {
    applyMenuAnalyticsDate(menuAnalyticsDatePickerState.field, menuAnalyticsDatePickerState.value);
    closeMenuAnalyticsDatePicker();
  };

  const resetMenuAnalyticsRange = () => {
    const range = createMenuAnalyticsRange();
    setMenuAnalyticsRange(range);
    void loadMenuAnalytics(range);
  };

  const closeSupport = () => {
    Keyboard.dismiss();
    setSupportMode('start');
    setSupportChatMessages([]);
    setSupportChatInput('');
    setSupportChatError('');
    setGuideSupportMessage('');
    setGuideSupportStatus('');
    setGuideSupportError('');
    setSupportOpen(false);
  };

  const openSupportAssistant = async () => {
    setSupportMode('assistant');
    setSupportChatError('');
    setSupportChatLoading(true);
    try {
      const messages = await getRestaurantSupportChat();
      setSupportChatMessages(Array.isArray(messages) ? messages : []);
      setTimeout(() => supportChatScrollRef.current?.scrollToEnd({ animated: false }), 0);
    } catch (error) {
      setSupportChatError(error?.message || 'Der Assistent konnte nicht geladen werden. Erneut versuchen.');
    } finally {
      setSupportChatLoading(false);
    }
  };

  const openTeamSupport = () => {
    Keyboard.dismiss();
    setSupportMode('team');
    setGuideSupportError('');
    setGuideSupportStatus('');
  };

  const handleSupportChatAction = (action) => {
    if (!action?.target) return;
    Keyboard.dismiss();
    setSupportOpen(false);
    if (action.target === 'offers') {
      openPanel('offers');
      return;
    }
    if (action.target === 'settings') {
      openDashboardSettings('root');
      return;
    }
    openPanel('myMenu');
    if (action.target === 'lunch') {
      setTimeout(() => openMenuWorkspace('lunch'), 0);
    }
  };

  const handleSupportChatSend = async (presetMessage) => {
    const message = String(presetMessage || supportChatInput || '').trim();
    if (!message || supportChatSending) return;

    const optimisticMessage = {
      id: `local-${Date.now()}`,
      role: 'user',
      content: message,
      createdAt: new Date().toISOString()
    };
    setSupportChatMessages((current) => [...current, optimisticMessage]);
    setSupportChatInput('');
    setSupportChatSending(true);
    setSupportChatError('');
    Keyboard.dismiss();
    try {
      const reply = await sendRestaurantSupportChatMessage(message);
      setSupportChatMessages((current) => [...current, reply]);
      setTimeout(() => supportChatScrollRef.current?.scrollToEnd({ animated: true }), 40);
    } catch (error) {
      setSupportChatMessages((current) =>
        current.filter((entry) => entry.id !== optimisticMessage.id)
      );
      setSupportChatInput(message);
      setSupportChatError(error?.message || 'Der Assistent konnte gerade nicht antworten. Erneut versuchen.');
    } finally {
      setSupportChatSending(false);
    }
  };

  const handleAddSpecialClosure = () => {
    const date = String(settingsSpecialClosureDate || '').trim();
    const reason = String(settingsSpecialClosureReason || '').trim();
    if (!specialClosureDatePattern.test(date)) {
      setStatus('Bitte zuerst ein Datum auswählen.');
      return;
    }
    if (reason.length < 2) {
      setStatus('Bitte einen Grund für den Schließtag eingeben.');
      return;
    }
    if (settingsSpecialClosures.some((entry) => entry.date === date)) {
      setStatus('Für dieses Datum gibt es bereits einen Schließtag.');
      return;
    }
    setSettingsSpecialClosures((prev) =>
      normalizeSpecialClosureEntries([...prev, { date, reason }])
    );
    setSettingsSpecialClosureDate('');
    setSettingsSpecialClosureReason('');
    setSettingsSpecialClosurePickerOpen(false);
    setStatus('Schließtag hinzugefügt.');
  };

  const handleRemoveSpecialClosure = (date) => {
    setSettingsSpecialClosures((prev) => prev.filter((entry) => entry.date !== date));
  };

  const handleGuideSupportSubmit = async () => {
    const message = guideSupportMessage.trim();
    if (message.length < 5) {
      setGuideSupportError('Bitte beschreibe dein Problem etwas genauer.');
      return;
    }
    setGuideSupportSending(true);
    setGuideSupportError('');
    setGuideSupportStatus('');
    try {
      const ok = await sendRestaurantSupportRequest({
        message,
        source: 'Restaurant Support'
      });
      if (ok) {
        setGuideSupportMessage('');
        setGuideSupportStatus('Deine Nachricht wurde an den Support gesendet.');
      } else {
        setGuideSupportError(restaurantError || 'Support-Nachricht konnte nicht gesendet werden.');
      }
    } catch {
      setGuideSupportError('Support-Nachricht konnte nicht gesendet werden.');
    } finally {
      // Keep typing uninterrupted; dismiss only after sending has finished.
      Keyboard.dismiss();
      setGuideSupportSending(false);
    }
  };

  const markOnboardingSeen = async () => {
    const ok = await markRestaurantOnboardingHintSeen();
    if (!ok) {
      onboardingHintHandledRef.current = false;
    }
  };

  const closeOnboardingAssistant = () => {
    setOnboardingAssistantOpen(false);
    void markOnboardingSeen();
  };

  const handleOnboardingOpenSettings = () => {
    setOnboardingAssistantOpen(false);
    setSettingsPage('root');
    setSettingsFeedback('');
    setSettingsOpen(true);
    void markOnboardingSeen();
  };

  const openDashboardSettings = (targetPage = 'root') => {
    setSettingsMealSlots(toEditableMealSlots(profileMealSlots));
    setSettingsReservationMode(
      normalizeReservationMode(
        restaurant?.reservationMode,
        Boolean(restaurant?.tableReservationEnabled)
      )
    );
    setSettingsReservationExternalLink(String(restaurant?.reservationExternalLink || '').trim());
    setSettingsReservationExternalEmail(String(restaurant?.reservationExternalEmail || '').trim());
    setSettingsReservationExternalPhone(String(restaurant?.reservationExternalPhone || '').trim());
    setSettingsOpeningHours(normalizeOpeningHours(restaurant?.openingHours));
    setSettingsSpecialClosures(normalizeSpecialClosureEntries(restaurant?.specialClosures));
    setSettingsSpecialClosureDate('');
    setSettingsSpecialClosureReason('');
    setSettingsSpecialClosurePickerOpen(false);
    setSettingsLogoUri(String(restaurant?.logoUrl || '').trim());
    setSettingsLogoUploading(false);
    setSettingsAboutText(String(restaurant?.aboutText || '').trim());
    setSettingsWebsiteSyncUrl(String(restaurant?.websiteSyncUrl || '').trim());
    setSettingsSocialLinks(normalizeSocialLinksForEdit(restaurant?.socialLinks));
    setSettingsProviderScopes(normalizeProviderScopesForEdit(restaurant?.providerScopes));
    setSettingsEventOfferingsText(String(restaurant?.eventProfile?.offeringsText || '').trim());
    setSettingsEventReservationUrl(String(restaurant?.eventProfile?.reservationUrl || '').trim());
    setSettingsEventContactUrl(String(restaurant?.eventProfile?.contactUrl || '').trim());
    setSettingsEventContactEmail(String(restaurant?.eventProfile?.contactEmail || '').trim());
    setSettingsEventContactPhone(String(restaurant?.eventProfile?.contactPhone || '').trim());
    setSettingsCateringOfferingsText(String(restaurant?.cateringProfile?.offeringsText || '').trim());
    setSettingsCateringContactUrl(String(restaurant?.cateringProfile?.contactUrl || '').trim());
    setSettingsCateringContactEmail(String(restaurant?.cateringProfile?.contactEmail || '').trim());
    setSettingsCateringContactPhone(String(restaurant?.cateringProfile?.contactPhone || '').trim());
    setSettingsName(String(restaurant?.name || '').trim());
    setSettingsEmail(String(restaurant?.email || '').trim());
    setSettingsPhone(String(restaurant?.phone || '').trim());
    setSettingsAddress(String(restaurant?.address || '').trim());
    setSettingsPostalCode(String(restaurant?.postalCode || '').trim());
    const requestedPage = typeof targetPage === 'string' ? targetPage : 'root';
    if (requestedPage === 'events' || requestedPage === 'catering') {
      setSettingsServicesTab(requestedPage);
      setSettingsPage('services');
    } else {
      setSettingsPage(requestedPage);
    }
    setSettingsServicesDirty(false);
    setSettingsFeedback('');
    setSettingsOpen(true);
  };

  const getWebsiteSyncDomain = (value) => {
    try {
      return new URL(String(value || '')).hostname.replace(/^www\./i, '');
    } catch {
      return String(value || '').replace(/^https?:\/\//i, '').split('/')[0];
    }
  };

  const openWebsiteSync = async () => {
    Keyboard.dismiss();
    setWebsiteSyncError('');
    setWebsiteSyncUrl(String(restaurant?.websiteSyncUrl || '').trim());
    setWebsiteSyncDraft(null);
    setWebsiteSyncSelectedItems({});
    setWebsiteSyncPriceOverrides({});
    setWebsiteSyncOpen(true);
    const draft = await getRestaurantWebsiteSync();
    if (draft) setWebsiteSyncDraft(draft);
  };

  const closeWebsiteSync = () => {
    if (websiteSyncApplying) return;
    Keyboard.dismiss();
    setWebsiteSyncOpen(false);
    setWebsiteSyncError('');
    setWebsiteSyncPreviewArea(null);
    setWebsiteSyncSelectedItems({});
    setWebsiteSyncPriceOverrides({});
  };

  const startWebsiteSync = async () => {
    const value = websiteSyncUrl.trim();
    if (!value) {
      setWebsiteSyncError('Bitte zuerst die Adresse deiner Website eingeben.');
      return;
    }
    Keyboard.dismiss();
    setWebsiteSyncError('');
    const draft = await startRestaurantWebsiteSync({ websiteUrl: value });
    if (!draft) {
      setWebsiteSyncError('Die Website konnte nicht gestartet werden. Bitte Adresse und Verbindung prüfen.');
      return;
    }
    setWebsiteSyncUrl(draft.websiteUrl || value);
    setWebsiteSyncDraft(draft);
  };

  const getWebsiteSyncMenu = (area, result = websiteSyncDraft?.result) => {
    if (!result?.menus) return null;
    return area === 'dinner'
      ? result.menus.dinner || result.menus.regular || null
      : result.menus[area] || null;
  };

  const getWebsiteSyncSources = (result = websiteSyncDraft?.result) => {
    const grouped = websiteSyncMenuAreas.flatMap(({ key }) => {
      const menu = getWebsiteSyncMenu(key, result);
      return menu?.items?.length ? [{
        ...menu,
        section: key,
        recognizedHeading: menu.recognizedHeading || '',
        confidence: menu.confidence || 'medium',
        unclassified: false
      }] : [];
    });
    if (result?.unclassifiedMenu?.items?.length) grouped.push(result.unclassifiedMenu);
    if (grouped.length) return grouped;
    // Drafts created before grouped areas remain readable in the preview.
    return Array.isArray(result?.menuSources) ? result.menuSources : [];
  };

  const applyWebsiteSyncSection = async (section, action, source = null, targetSection = null) => {
    if (!websiteSyncDraft?.id) return;
    const selectionKey = source?.id || section;
    const menu = section === 'openingHours' ? null : source || getWebsiteSyncMenu(section);
    const selectedItemIds = menu?.items?.map((item) => item.id).filter((id) => websiteSyncSelectedItems?.[selectionKey]?.[id]) || [];
    if (section !== 'openingHours' && action !== 'skip' && !selectedItemIds.length) {
      setWebsiteSyncError('Bitte mindestens ein Gericht auswählen oder diesen Bereich überspringen.');
      return;
    }
    const unresolvedPrices = (menu?.items || []).filter((item) => (
      selectedItemIds.includes(item.id)
      && item.price == null
      && normalizePriceInput(websiteSyncPriceOverrides?.[item.id]) === null
    ));
    if (section !== 'openingHours' && action !== 'skip' && unresolvedPrices.length) {
      setWebsiteSyncError(`Bitte ergänze für ${unresolvedPrices.length} ausgewählte${unresolvedPrices.length === 1 ? 's Gericht' : ' Gerichte'} den Preis unter „Gerichte ansehen“.`);
      setWebsiteSyncPreviewArea(selectionKey);
      return;
    }
    const priceOverrides = Object.fromEntries((menu?.items || [])
      .filter((item) => selectedItemIds.includes(item.id) && item.price == null)
      .map((item) => [item.id, normalizePriceInput(websiteSyncPriceOverrides?.[item.id])])
      .filter(([, price]) => price !== null));
    setWebsiteSyncApplying(selectionKey);
    setWebsiteSyncError('');
    const next = await applyRestaurantWebsiteSync({
      draftId: websiteSyncDraft.id,
      section,
      action,
      ...(source && !source.legacy ? { sourceId: source.id } : {}),
      ...(targetSection ? { targetSection } : {}),
      ...(section === 'openingHours' ? {} : { selectedItemIds, priceOverrides })
    });
    if (next) {
      setWebsiteSyncDraft(next);
    } else {
      setWebsiteSyncError('Der Bereich konnte nicht übernommen werden. Deine bisherigen Daten bleiben unverändert.');
    }
    setWebsiteSyncApplying('');
  };

  useEffect(() => {
    if (!websiteSyncOpen || websiteSyncDraft?.status !== 'running') return undefined;
    const timer = setInterval(async () => {
      const next = await getRestaurantWebsiteSync();
      if (next) setWebsiteSyncDraft(next);
    }, 1300);
    return () => clearInterval(timer);
  }, [websiteSyncOpen, websiteSyncDraft?.status]);

  useEffect(() => {
    if (websiteSyncDraft?.status !== 'completed' || !websiteSyncDraft?.result) return;
    setWebsiteSyncSelectedItems((current) => {
      const next = { ...current };
      getWebsiteSyncSources(websiteSyncDraft.result).forEach((source) => {
        if (!source?.items?.length || next[source.id]) return;
        next[source.id] = source.items.reduce((selected, item) => ({ ...selected, [item.id]: true }), {});
      });
      return next;
    });
  }, [websiteSyncDraft?.id, websiteSyncDraft?.status, websiteSyncDraft?.completedAt]);

  const confirmDashboardLogout = () => {
    const message = 'Möchtest du dich wirklich abmelden?';
    if (Platform.OS === 'web' && typeof globalThis.confirm === 'function') {
      if (globalThis.confirm(message)) logout();
      return;
    }
    Alert.alert('Abmelden', message, [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Abmelden', style: 'destructive', onPress: logout }
    ]);
  };

  const handleOnboardingStartKi = () => {
    setOnboardingAssistantOpen(false);
    openPanel('myMenu');
    void markOnboardingSeen();
  };

  const persistMenuForCurrentMode = async (kind, payload) => {
    if (kind === 'lunch') {
      return isOnboardingMode
        ? saveRestaurantOnboardingLunchMenu(payload)
        : saveRestaurantLunchMenu(payload);
    }
    if (isOnboardingMode) {
      return saveRestaurantOnboardingDigitalMenu(payload);
    }
    return saveRestaurantDigitalMenu(payload);
  };

  const persistDigitalMenuDraft = async (kind = 'normal', rawItems = null) => {
    const menuState = getMenuDraftState(kind);
    const isLunchMenu = kind === 'lunch';
    let invalidCount = 0;
    const normalizedAllergens = normalizeAllergenList(menuState.draft.allergens);
    const normalizedItems = (Array.isArray(rawItems) ? rawItems : menuState.draft.items || []).map((item) => {
      const name = String(item.name || '').trim();
      const price = normalizePriceInput(item.priceText || item.price);
      if (!name || price === null) {
        invalidCount += 1;
        return null;
      }
      let schedule = deriveLunchSchedule(item, { allowPending: isLunchMenu });
      if (isLunchMenu && schedule.schedulePending) {
        schedule = deriveLunchSchedule({ scheduleMode: 'openingHours' }, { allowPending: true });
      }
      return {
        id: item.id || createDraftId(),
        name,
        description: String(item.description || '').trim(),
        price,
        category: normalizeDraftCategory(item.category, item.section, name, item.description),
        section: normalizeDigitalSectionTitle(item.section, item.category),
        allergens: normalizeAllergenList(item.allergens).slice(0, 20),
        availableWeekdays: isLunchMenu ? schedule.availableWeekdays : undefined,
        repeatWeekly: isLunchMenu ? schedule.repeatWeekly : undefined,
        activeWeekKey: isLunchMenu ? schedule.activeWeekKey : undefined,
        schedulePending: isLunchMenu ? false : undefined,
        scheduleMode: isLunchMenu ? schedule.scheduleMode : undefined,
        validFrom: isLunchMenu ? schedule.validFrom : undefined,
        validUntil: isLunchMenu ? schedule.validUntil : undefined,
        active: isLunchMenu ? item?.active !== false : undefined
      };
    });

    if (invalidCount > 0) {
      menuState.setError(`Bitte ${invalidCount} ungültige Einträge korrigieren (Name/Preis).`);
      return;
    }

    if (!normalizedItems.length) {
      menuState.setError('Keine Gerichte vorhanden.');
      return;
    }

    menuState.setSaving(true);
    menuState.setError('');
    try {
      const result = await persistMenuForCurrentMode(kind, {
        items: normalizedItems.filter(Boolean),
        allergens: normalizedAllergens
      });
      const nextDraft = buildDigitalMenuDraft(result, { lunchMode: isLunchMenu });
      menuState.setDraft(nextDraft);
      menuState.setStatus(
        isLunchMenu
          ? 'Mittagstisch-Karte gespeichert.'
          : isOnboardingMode
          ? 'Speisekarte gespeichert.'
          : 'Menü gespeichert.'
      );
      menuState.setDirty(false);
      if (isLunchMenu) {
        setLunchValidityReviewRequired(false);
        if (isOnboardingMode) setOnboardingLunchMenuOpen(false);
        else setLunchMenuToolsOpen(false);
      } else if (isOnboardingMode) {
        setOnboardingRegularMenuOpen(false);
      } else {
        setMenuKiToolsOpen(false);
      }
      return true;
    } catch (error) {
      const detail = error instanceof Error ? error.message : '';
      menuState.setError(
        detail || (isLunchMenu ? 'Mittagstisch-Karte konnte nicht gespeichert werden.' : 'Menü konnte nicht gespeichert werden.')
      );
      return false;
    } finally {
      menuState.setSaving(false);
    }
  };

  const handleSaveDigitalMenu = async (kind = 'normal') => {
    const resolvedKind = kind === 'lunch' ? 'lunch' : 'normal';
    if (resolvedKind === 'lunch') {
      const requiresValidityReview =
        lunchValidityReviewRequired ||
        (lunchMenuDraft.items || []).some((item) => {
          const schedule = deriveLunchSchedule(item, { allowPending: true });
          return schedule.schedulePending;
        });
      if (requiresValidityReview) {
        setLunchMenuError('');
        openLunchValidityEditor('save', lunchMenuDraft, true);
        return false;
      }
    }
    return persistDigitalMenuDraft(resolvedKind);
  };

  const handleClearDigitalMenu = async (kind = 'normal') => {
    const menuState = getMenuDraftState(kind);
    const isLunchMenu = kind === 'lunch';
    if (menuState.saving) return;
    menuState.setSaving(true);
    menuState.setError('');
    try {
      const result = await deleteRestaurantMenuCard(kind === 'lunch' ? 'lunch' : 'regular', isOnboardingMode);
      const nextDraft = buildDigitalMenuDraft(result, { lunchMode: isLunchMenu });
      menuState.setDraft(nextDraft);
      menuState.setStatus(
        isLunchMenu
          ? 'Mittagstisch-Karte wurde geleert.'
          : isOnboardingMode
          ? 'Erkanntes Menü wurde geleert.'
          : 'Digitales Menü wurde geleert.'
      );
      menuState.setDirty(false);
      if (isLunchMenu) {
        setLunchMenuToolsOpen(false);
      } else {
        setMenuKiToolsOpen(false);
      }
      if (isLunchMenu) setLunchValidityReviewRequired(false);
    } catch (error) {
      const detail = error instanceof Error ? error.message : '';
      menuState.setError(
        detail || (isLunchMenu ? 'Mittagstisch-Karte konnte nicht geleert werden.' : 'Digitales Menü konnte nicht geleert werden.')
      );
    } finally {
      menuState.setSaving(false);
    }
  };

  const confirmClearDigitalMenu = (kind = 'normal') => {
    const isLunchMenu = kind === 'lunch';
    const menuState = getMenuDraftState(kind);
    if (menuState.saving) return;

    Alert.alert(
      isLunchMenu ? 'Mittagstisch-Karte löschen' : 'Speisekarte löschen',
      isLunchMenu
        ? 'Möchtest du die komplette Mittagstisch-Karte wirklich löschen?'
        : 'Möchtest du die komplette Speisekarte wirklich löschen?',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Löschen',
          style: 'destructive',
          onPress: () => {
            void handleClearDigitalMenu(kind);
          }
        }
      ]
    );
  };

  const handleDigitalAllergensChange = (value, kind = 'normal') => {
    const menuState = getMenuDraftState(kind);
    menuState.setAllergensText(value);
    menuState.setDraft((prev) => ({
      ...prev,
      allergens: normalizeAllergenList(value)
    }));
    menuState.setDirty(true);
  };

  const handleOpenMenu = async (menuEntry = null) => {
    const menuUrl = menuEntry?.url || latestMenuFile?.url || restaurant?.menuUrl;
    if (!menuUrl) {
      setStatus('Kein Menü vorhanden.');
      return;
    }

    try {
      const supported = await Linking.canOpenURL(menuUrl);
      if (!supported) {
        setStatus('Menü-Link konnte nicht geöffnet werden.');
        return;
      }
      await Linking.openURL(menuUrl);
    } catch (error) {
      setStatus('Menü konnte nicht geöffnet werden.');
    }
  };

  const goToOnboardingStep = (nextIndex, options = {}) => {
    const { preserveMessages = false } = options;
    const clamped = Math.max(0, Math.min(restaurantOnboardingSteps.length - 1, nextIndex));
    setOnboardingStepIndex(clamped);
    if (!preserveMessages) {
      setOnboardingError('');
      setOnboardingStatus('');
    }
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo?.({ y: 0, animated: true });
    });
  };

  const handleOnboardingBack = () => {
    if (onboardingStepIndex <= 0) return;
    goToOnboardingStep(onboardingStepIndex - 1);
  };

  const handleOnboardingReservationChange = (mode) => {
    setSettingsReservationMode(normalizeReservationMode(mode));
    setOnboardingReservationChoiceMade(true);
    setOnboardingError('');
    setOnboardingStatus('');
    setStatus('');
  };

  const clearReservationContactMessages = () => {
    setOnboardingError('');
    setOnboardingStatus('');
    setStatus('');
  };

  const handleReservationExternalLinkChange = (value) => {
    setSettingsReservationExternalLink(value);
    clearReservationContactMessages();
  };

  const handleReservationExternalEmailChange = (value) => {
    setSettingsReservationExternalEmail(value);
    clearReservationContactMessages();
  };

  const handleReservationExternalPhoneChange = (value) => {
    setSettingsReservationExternalPhone(value);
    clearReservationContactMessages();
  };

  const handleOnboardingNext = async () => {
    const validationError = validateOnboardingStep();
    if (validationError) {
      setOnboardingError(validationError);
      return;
    }

    if (onboardingStepIndex === 5) {
      if (lunchValidityReviewRequired && (lunchMenuDraft.items || []).length) {
        setOnboardingLunchMenuOpen(true);
        openLunchValidityEditor('save', lunchMenuDraft, true);
        return;
      }
      if (digitalMenuDirty) {
        const saved = await handleSaveDigitalMenu();
        if (!saved) return;
      }
      if (lunchMenuDirty) {
        const saved = await handleSaveDigitalMenu('lunch');
        if (!saved) return;
      }
    }

    const targetStep = Math.min(onboardingStepIndex + 1, restaurantOnboardingSteps.length - 1);
    const ok = await persistRestaurantOnboardingDraft(targetStep);
    if (!ok) {
      setOnboardingError(restaurantError || 'Einrichtung konnte nicht gespeichert werden.');
      return;
    }
    goToOnboardingStep(targetStep);
  };

  const handleCompleteRestaurantOnboarding = async () => {
    const validationError = validateOnboardingStep(5);
    if (validationError) {
      goToOnboardingStep(5, { preserveMessages: true });
      setOnboardingError(validationError);
      return;
    }

    if (lunchValidityReviewRequired && (lunchMenuDraft.items || []).length) {
      goToOnboardingStep(5, { preserveMessages: true });
      setOnboardingLunchMenuOpen(true);
      openLunchValidityEditor('save', lunchMenuDraft, true);
      return;
    }

    if (digitalMenuDirty) {
      const saved = await handleSaveDigitalMenu();
      if (!saved) return;
    }
    if (lunchMenuDirty) {
      const saved = await handleSaveDigitalMenu('lunch');
      if (!saved) return;
    }

    const draftSaved = await persistRestaurantOnboardingDraft(6);
    if (!draftSaved) {
      setOnboardingError(restaurantError || 'Einrichtung konnte nicht gespeichert werden.');
      return;
    }

    const ok = await completeRestaurantOnboarding();
    if (!ok) {
      setOnboardingError(restaurantError || 'Einrichtung konnte nicht abgeschlossen werden.');
      return;
    }

    setOnboardingStatus('Einrichtung gespeichert.');
    setOnboardingError('');
    setStatus('Einrichtung gespeichert.');
    setActivePanel(null);
    setMenuPdfToolsOpen(false);
    setMenuKiToolsOpen(false);
    setLunchMenuToolsOpen(false);
  };

  const handleDeleteMenu = () => {
    if (!hasUploadedMenu) {
      setStatus('Kein Menü vorhanden.');
      return;
    }

    Alert.alert('Menü löschen', 'Möchtest du das aktuelle Menü wirklich löschen?', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: async () => {
          const ok = await deleteRestaurantMenu();
          if (ok) {
            setStatus('Menü gelöscht.');
          }
        }
      }
    ]);
  };

  const closeTimePicker = () => {
    setTimePickerState((prev) => ({
      ...prev,
      visible: false
    }));
  };

  const setOpeningDayEnabled = (dayKey, enabled) => {
    setSettingsOpeningHours((prev) => {
      const current = normalizeOpeningHours(prev);
      const day = current[dayKey] || createDefaultOpeningHours()[dayKey];
      const periods = enabled
        ? normalizeOpeningPeriods(day.periods, day.openTime, day.closeTime, true)
        : [];
      return {
        ...current,
        [dayKey]: {
          ...day,
          enabled,
          openTime: periods[0]?.openTime || day.openTime,
          closeTime: periods[0]?.closeTime || day.closeTime,
          periods
        }
      };
    });
  };

  const updateOpeningPeriod = (dayKey, periodIndex, patch) => {
    setSettingsOpeningHours((prev) => {
      const current = normalizeOpeningHours(prev);
      const day = current[dayKey];
      const periods = normalizeOpeningPeriods(day.periods, day.openTime, day.closeTime, true).map(
        (period, index) => (index === periodIndex ? { ...period, ...patch } : period)
      );
      return {
        ...current,
        [dayKey]: {
          ...day,
          enabled: true,
          openTime: periods[0].openTime,
          closeTime: periods[0].closeTime,
          periods,
          // A manually selected closing time replaces a synced "bis Ende" value.
          openEnded: Object.prototype.hasOwnProperty.call(patch, 'closeTime') ? false : day.openEnded
        }
      };
    });
  };

  const addOpeningPeriod = (dayKey) => {
    setSettingsOpeningHours((prev) => {
      const current = normalizeOpeningHours(prev);
      const day = current[dayKey];
      const periods = normalizeOpeningPeriods(day.periods, day.openTime, day.closeTime, true);
      if (periods.length >= 2) return current;
      return {
        ...current,
        [dayKey]: {
          ...day,
          enabled: true,
          periods: [...periods, { openTime: '17:00', closeTime: DEFAULT_CLOSE_TIME }]
        }
      };
    });
  };

  const removeOpeningPeriod = (dayKey) => {
    setSettingsOpeningHours((prev) => {
      const current = normalizeOpeningHours(prev);
      const day = current[dayKey];
      const periods = normalizeOpeningPeriods(day.periods, day.openTime, day.closeTime, true).slice(0, 1);
      return {
        ...current,
        [dayKey]: {
          ...day,
          openTime: periods[0].openTime,
          closeTime: periods[0].closeTime,
          periods
        }
      };
    });
  };

  const openTimePicker = (dayKey, periodIndex, field) => {
    Keyboard.dismiss();
    const fallback = field === 'openTime' ? DEFAULT_OPEN_TIME : DEFAULT_CLOSE_TIME;
    const day = settingsOpeningHours?.[dayKey];
    const period = normalizeOpeningPeriods(day?.periods, day?.openTime, day?.closeTime, true)[periodIndex];
    setTimePickerState({
      visible: true,
      dayKey,
      periodIndex,
      field,
      value: normalizeTimeInput(period?.[field], fallback)
    });
  };

  const applyPickedTime = (value) => {
    setTimePickerState((prev) => {
      if (!prev.dayKey || !prev.field || !openingTimeOptions.includes(value)) {
        return {
          ...prev,
          visible: false
        };
      }
      updateOpeningPeriod(prev.dayKey, prev.periodIndex, { [prev.field]: value });
      return {
        ...prev,
        visible: false,
        value
      };
    });
  };

  const normalizeOpeningHoursPayload = () => {
    return normalizeOpeningHours(settingsOpeningHours);
  };

  const updateSettingsSocialLink = (index, field, value) => {
    setSettingsSocialLinks((prev) =>
      normalizeSocialLinksForEdit(prev).map((entry, itemIndex) =>
        itemIndex === index ? { ...entry, [field]: value } : entry
      )
    );
  };

  const addSettingsSocialLink = () => {
    setSettingsSocialLinks((prev) => [...normalizeSocialLinksForEdit(prev), { ...emptySocialLink }].slice(0, 12));
  };

  const removeSettingsSocialLink = (index) => {
    setSettingsSocialLinks((prev) => {
      const next = normalizeSocialLinksForEdit(prev).filter((_, itemIndex) => itemIndex !== index);
      return next.length ? next : [{ ...emptySocialLink }];
    });
  };

  const handleSaveRestaurantSettings = async ({ section = 'all', closeAfterSave = false, returnToRoot = true } = {}) => {
    if (!restaurant) return;
    setSettingsFeedback('');
    const cleanedName = settingsName.trim();
    const cleanedEmail = settingsEmail.trim().toLowerCase();
    const cleanedPhone = settingsPhone.trim();
    const cleanedAddress = settingsAddress.trim();
    const cleanedPostalCode = settingsPostalCode.trim();
    const failSettingsSave = (message) => {
      setStatus(message);
      setSettingsFeedback(message);
      return false;
    };
    const includesSection = (key) => section === 'all' || section === key;
    let socialLinksResult = { links: [], error: '' };

    if (includesSection('profile')) {
      if (cleanedName.length < 2) return failSettingsSave('Bitte einen gültigen Restaurantnamen eingeben.');
      if (!reservationEmailPattern.test(cleanedEmail)) {
        return failSettingsSave('Bitte eine gültige E-Mail-Adresse eingeben.');
      }
      if (cleanedPhone.length < 6) return failSettingsSave('Bitte eine gültige Telefonnummer eingeben.');
      if (cleanedAddress.length < 4) return failSettingsSave('Bitte eine gültige Adresse eingeben.');
      if (cleanedPostalCode.length < 4) {
        return failSettingsSave('Bitte eine gültige Postleitzahl eingeben.');
      }
      socialLinksResult = prepareSocialLinksPayload(settingsSocialLinks);
      if (socialLinksResult.error) return failSettingsSave(socialLinksResult.error);
    }

    if (includesSection('reservation')) {
      const reservationError = validateReservationModeSettings();
      if (reservationError) return failSettingsSave(reservationError);
    }

    if (includesSection('catering')) {
      const scopes = normalizeProviderScopesForEdit(settingsProviderScopes);
      if (scopes.includes('catering')) {
        if (settingsCateringOfferingsText.trim().length < 2) {
          return failSettingsSave('Bitte beschreibe kurz, was du im Catering anbietest.');
        }
        if (
          !settingsCateringContactUrl.trim() &&
          !settingsCateringContactEmail.trim() &&
          !settingsCateringContactPhone.trim() &&
          !settingsPhone.trim()
        ) {
          return failSettingsSave('Bitte mindestens eine Catering-Kontaktmöglichkeit angeben.');
        }
      }
    }

    if (includesSection('visibility')) {
      const openingHoursError = validateOpeningHoursGroups();
      if (openingHoursError) return failSettingsSave(openingHoursError);
    }

    const payload = {};
    if (includesSection('profile')) {
      Object.assign(payload, {
        name: cleanedName,
        email: cleanedEmail,
        phone: cleanedPhone,
        address: cleanedAddress,
        postalCode: cleanedPostalCode,
        aboutText: settingsAboutText.trim(),
        websiteSyncUrl: settingsWebsiteSyncUrl.trim(),
        socialLinks: socialLinksResult.links
      });
    }
    if (includesSection('visibility')) {
      Object.assign(payload, {
        mealSlots: settingsSlotList,
        cuisineTypes: normalizeCuisineTypes(settingsCuisineTypes),
        openingHours: normalizeOpeningHoursPayload(),
        specialClosures: normalizeSpecialClosureEntries(settingsSpecialClosures)
      });
    }
    if (includesSection('reservation')) {
      Object.assign(payload, {
        tableReservationEnabled: settingsTableReservationEnabled,
        reservationMode: settingsReservationMode,
        reservationExternalLink: settingsReservationExternalLink.trim(),
        reservationExternalEmail: settingsReservationExternalEmail.trim(),
        reservationExternalPhone: settingsReservationExternalPhone.trim()
      });
    }
    if (includesSection('events')) {
      const providerScopes = eventsEnabled
        ? normalizeProviderScopesForEdit(settingsProviderScopes)
        : ['food'];
      Object.assign(payload, {
        providerScopes,
        eventProfile: {
          offeringsText: settingsEventOfferingsText.trim(),
          reservationUrl: settingsEventReservationUrl.trim(),
          contactUrl: settingsEventContactUrl.trim(),
          contactEmail: settingsEventContactEmail.trim(),
          contactPhone: settingsEventContactPhone.trim()
        },
        eventSetupCompletedAt:
          eventsEnabled && providerScopes.includes('events') ? new Date().toISOString() : null
      });
    }
    if (includesSection('catering')) {
      const providerScopes = cateringEnabled
        ? normalizeProviderScopesForEdit(settingsProviderScopes)
        : ['food'];
      Object.assign(payload, {
        providerScopes,
        cateringProfile: {
          offeringsText: settingsCateringOfferingsText.trim(),
          contactUrl: settingsCateringContactUrl.trim(),
          contactEmail: settingsCateringContactEmail.trim(),
          contactPhone: settingsCateringContactPhone.trim()
        },
        cateringSetupCompletedAt:
          cateringEnabled && providerScopes.includes('catering') ? new Date().toISOString() : null
      });
    }

    const ok = await updateRestaurantProfile(payload);
    if (ok) {
      setStatus('Restaurant-Einstellungen gespeichert.');
      setSettingsFeedback('Änderungen gespeichert.');
      if (section === 'events' || section === 'catering') {
        setSettingsServicesDirty(false);
      }
      if (closeAfterSave) {
        setSettingsOpen(false);
      } else if (returnToRoot) {
        setSettingsPage('root');
      }
    } else {
      setSettingsFeedback('Änderungen konnten nicht gespeichert werden.');
    }
    return ok;
  };

  const openSettingsPage = (page) => {
    Keyboard.dismiss();
    setSettingsFeedback('');
    if (page === 'events' || page === 'catering') {
      setSettingsServicesTab(page);
      setSettingsServicesDirty(false);
      setSettingsPage('services');
      return;
    }
    if (page === 'services') {
      setSettingsServicesDirty(false);
    }
    setSettingsPage(page);
  };

  const updateSettingsServiceField = (setter, value) => {
    setter(value);
    setSettingsServicesDirty(true);
  };

  const requestSettingsServicesTab = (nextTab) => {
    if (nextTab === settingsServicesTab) return;
    const applyTab = () => {
      setSettingsServicesTab(nextTab);
      setSettingsServicesDirty(false);
      setSettingsFeedback('');
    };
    if (!settingsServicesDirty) {
      applyTab();
      return;
    }
    Alert.alert('Ungespeicherte Änderungen', 'Möchtest du deine Änderungen speichern, bevor du den Bereich wechselst?', [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Verwerfen', style: 'destructive', onPress: applyTab },
      {
        text: 'Speichern',
        onPress: async () => {
          const saved = await handleSaveRestaurantSettings({
            section: settingsServicesTab,
            returnToRoot: false
          });
          if (saved) applyTab();
        }
      }
    ]);
  };

  const handleSettingsBack = () => {
    Keyboard.dismiss();
    if (settingsPage === 'root') {
      setSettingsOpen(false);
      return;
    }
    setSettingsPage('root');
  };

  const toggleSettingsEventsEnabled = () => {
    setSettingsProviderScopes((current) => {
      const scopes = normalizeProviderScopesForEdit(current);
      if (scopes.includes('events')) {
        const withoutEvents = scopes.filter((scope) => scope !== 'events');
        return withoutEvents.length ? withoutEvents : ['food'];
      }
      return [...scopes, 'events'];
    });
    setSettingsServicesDirty(true);
  };

  const toggleSettingsCateringEnabled = () => {
    setSettingsProviderScopes((current) => {
      const scopes = normalizeProviderScopesForEdit(current);
      if (scopes.includes('catering')) {
        const withoutCatering = scopes.filter((scope) => scope !== 'catering');
        return withoutCatering.length ? withoutCatering : ['catering'];
      }
      return [...scopes, 'catering'];
    });
    setSettingsServicesDirty(true);
  };

  const handleChangeSettingsPassword = async () => {
    setSettingsFeedback('');
    if (settingsCurrentPassword.length < 6) {
      setSettingsFeedback('Bitte das aktuelle Passwort vollständig eingeben.');
      return;
    }
    if (settingsNewPassword.length < 6) {
      setSettingsFeedback('Das neue Passwort muss mindestens 6 Zeichen haben.');
      return;
    }
    if (settingsNewPassword !== settingsNewPasswordConfirm) {
      setSettingsFeedback('Die neuen Passwörter stimmen nicht überein.');
      return;
    }

    const ok = await changeRestaurantPassword({
      currentPassword: settingsCurrentPassword,
      newPassword: settingsNewPassword
    });
    if (!ok) {
      setSettingsFeedback('Passwort konnte nicht geändert werden.');
      return;
    }

    setSettingsCurrentPassword('');
    setSettingsNewPassword('');
    setSettingsNewPasswordConfirm('');
    setSettingsOpen(false);
    logout();
    Alert.alert(
      'Passwort geändert',
      'Alle Sitzungen wurden aus Sicherheitsgründen beendet. Bitte melde dich mit dem neuen Passwort an.'
    );
  };

  const validateOpeningHoursGroups = () => {
    const activeDays = openingHourDays.filter((day) => settingsOpeningHours?.[day.key]?.enabled);
    if (!activeDays.length) return 'Bitte mindestens einen geöffneten Tag angeben.';

    for (const day of activeDays) {
      const entry = settingsOpeningHours[day.key];
      const periods = normalizeOpeningPeriods(entry?.periods, entry?.openTime, entry?.closeTime, true);
      if (!periods.length) return `${day.label}: Bitte eine Öffnungszeit auswählen.`;
      const intervals = periods.map((period) => {
        const open = toMinutes(period.openTime);
        const close = toMinutes(period.closeTime);
        if (open === null || close === null || open === close) return null;
        return { start: open, end: close <= open ? close + 24 * 60 : close };
      });
      if (intervals.some((interval) => !interval)) {
        return `${day.label}: Öffnungs- und Schließzeit dürfen nicht gleich sein.`;
      }
      if (
        intervals.length === 2 &&
        intervals[0].start < intervals[1].end &&
        intervals[1].start < intervals[0].end
      ) {
        return `${day.label}: Die beiden Öffnungszeiten dürfen sich nicht überschneiden.`;
      }
    }
    return '';
  };

  const validateReservationModeSettings = (requireChoice = false) => {
    if (requireChoice && !onboardingReservationChoiceMade) {
      return 'Bitte wähle einen Reservierungsweg aus.';
    }

    if (settingsReservationMode !== 'external') {
      return '';
    }

    const normalizedLink = normalizeReservationExternalLinkValue(settingsReservationExternalLink);
    const normalizedEmail = normalizeReservationExternalEmailValue(settingsReservationExternalEmail);
    const normalizedPhone = normalizeReservationExternalPhoneValue(settingsReservationExternalPhone);

    if (settingsReservationExternalLink.trim() && !normalizedLink) {
      return 'Bitte einen gültigen Link für das Reservierungsportal eingeben.';
    }
    if (settingsReservationExternalEmail.trim() && !normalizedEmail) {
      return 'Bitte eine gültige Reservierungs-E-Mail eingeben.';
    }
    if (settingsReservationExternalPhone.trim() && !normalizedPhone) {
      return 'Bitte eine gültige Telefonnummer eingeben.';
    }
    if (!normalizedLink && !normalizedEmail && !normalizedPhone) {
      return 'Bitte mindestens Portal-Link, E-Mail oder Telefon für externe Reservierungen angeben.';
    }

    return '';
  };

  const buildOnboardingDraftPayload = (lastStep = onboardingStepIndex) => ({
    mealSlots: settingsSlotList,
    cuisineTypes: normalizeCuisineTypes(settingsCuisineTypes),
    tableReservationEnabled: Boolean(settingsTableReservationEnabled),
    tableReservationChoiceMade: Boolean(onboardingReservationChoiceMade),
    reservationMode: settingsReservationMode,
    reservationExternalLink: settingsReservationExternalLink.trim(),
    reservationExternalEmail: settingsReservationExternalEmail.trim(),
    reservationExternalPhone: settingsReservationExternalPhone.trim(),
    openingHours: normalizeOpeningHoursPayload(),
    aboutText: settingsAboutText.trim(),
    lastStep
  });

  const persistRestaurantOnboardingDraft = async (lastStep = onboardingStepIndex) => {
    const nextDraft = await updateRestaurantOnboardingDraft(buildOnboardingDraftPayload(lastStep));
    return Boolean(nextDraft);
  };

  const validateOnboardingStep = (stepIndex = onboardingStepIndex) => {
    if (stepIndex === 0 && !settingsSlotList.length) {
      return 'Bitte wähle mindestens einen Bereich aus.';
    }
    if (stepIndex === 1 && !normalizeCuisineTypes(settingsCuisineTypes).length) {
      return 'Bitte wähle mindestens eine Küche aus.';
    }
    if (stepIndex === 2) {
      return validateReservationModeSettings(true);
    }
    if (stepIndex === 3) {
      return validateOpeningHoursGroups();
    }
    return '';
  };

  const handleSubmit = async () => {
    setStatus('');
    const cleanedTitle = title.trim();
    const cleanedDescription = description.trim();
    const cleanedPrice = normalizePriceInput(price);

    if (!cleanedTitle || !cleanedDescription || !price) {
      setStatus('Bitte alle Pflichtfelder ausfüllen.');
      return;
    }

    if (cleanedPrice === null) {
      setStatus('Bitte einen gültigen Preis eingeben.');
      return;
    }
    const slotEnabled = await ensureOfferMealSlotEnabled(offerMealSlot);
    if (!slotEnabled) {
      setStatus('Bereich konnte nicht aktiviert werden. Bitte erneut versuchen.');
      return;
    }

    const dietaryTags = [isVegan ? 'vegan' : null, isVegetarian ? 'vegetarian' : null].filter(Boolean);
    const tags = ensureOfferTypeTag(dietaryTags, offerType);

    let uploadedImageUrl;
    if (imageAsset) {
      uploadedImageUrl = await uploadRestaurantOfferImage(imageAsset);
      if (!uploadedImageUrl) {
        setStatus('Bild-Upload fehlgeschlagen. Bitte erneut versuchen.');
        return;
      }
    }

    const payload = {
      title: cleanedTitle,
      description: cleanedDescription,
      price: cleanedPrice,
      tags: tags.length ? tags : ['classic'],
      mealSlot: offerMealSlot,
      preorderEnabled
    };
    if (uploadedImageUrl) {
      payload.imageUrl = uploadedImageUrl;
    }

    const ok = editingOffer
      ? await updateRestaurantOffer(editingOffer.id, payload)
      : await createRestaurantOffer(payload);
    if (ok) {
      setStatus(editingOffer ? 'Angebot aktualisiert.' : '');
      setTitle('');
      setPrice('');
      setDescription('');
      setOfferMealSlot(profileSlotList[0] || DEFAULT_MEAL_SLOT);
      setOfferType('normal');
      setIsVegan(false);
      setIsVegetarian(false);
      setPreorderEnabled(false);
      setImageUri(null);
      setImageAsset(null);
      setEditingOffer(null);
      setOffersCreateOpen(false);
      setOffersListOpen(true);
    }
  };

  const startEdit = (offer) => {
    if (offer?.mealSlot && !profileSlotList.includes(offer.mealSlot)) {
      setProfileMealSlots((prev) => normalizeMealSlots([...prev, offer.mealSlot]));
    }
    setActivePanel('offers');
    setOffersCreateOpen(true);
    setOffersListOpen(false);
    setEditingOffer(offer);
    setTitle(offer.title || '');
    setPrice(offer.price != null ? String(offer.price) : '');
    setDescription(offer.description || '');
    setOfferMealSlot(offer.mealSlot || DEFAULT_MEAL_SLOT);
    setOfferType(inferOfferTypeFromTags(offer.tags));
    setIsVegan(Boolean(offer.tags?.includes('vegan')));
    setIsVegetarian(Boolean(offer.tags?.includes('vegetarian')));
    setPreorderEnabled(Boolean(offer.preorderEnabled));
    setImageUri(offer.imageUrl || null);
    setImageAsset(null);
    setStatus('Bearbeitungsmodus aktiv.');
  };

  const cancelEdit = () => {
    setEditingOffer(null);
    setTitle('');
    setPrice('');
    setDescription('');
    setOfferMealSlot(profileSlotList[0] || DEFAULT_MEAL_SLOT);
    setOfferType('normal');
    setIsVegan(false);
    setIsVegetarian(false);
    setPreorderEnabled(false);
    setImageUri(null);
    setImageAsset(null);
    setStatus('Bearbeitung abgebrochen.');
  };

  const handleDeleteOffer = (offer) => {
    if (!offer?.id) return;

    const removeConfirmed = async () => {
      const ok = await removeRestaurantOffer(offer.id);
      if (!ok) return;
      if (editingOffer?.id === offer.id) {
        cancelEdit();
      }
      setStatus('Angebot gelöscht.');
    };

    const title = String(offer.title || 'dieses Angebot').trim();
    const prompt = `Willst du "${title}" wirklich löschen?`;

    if (Platform.OS === 'web' && typeof globalThis.confirm === 'function') {
      if (!globalThis.confirm(prompt)) return;
      void removeConfirmed();
      return;
    }

    Alert.alert('Angebot löschen', prompt, [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: () => {
          void removeConfirmed();
        }
      }
    ]);
  };

  const resetCateringOfferForm = () => {
    setEditingCateringOffer(null);
    setCateringOfferTitle('');
    setCateringOfferDescription('');
    setCateringOfferPrice('');
    setCateringOfferImages([]);
    setCateringOfferFormOpen(false);
    setCateringOfferStatus('');
    Keyboard.dismiss();
  };

  const openCateringOfferEditor = (offer = null) => {
    setEditingCateringOffer(offer);
    setCateringOfferTitle(String(offer?.title || ''));
    setCateringOfferDescription(String(offer?.description || ''));
    setCateringOfferPrice(offer?.price != null ? String(offer.price).replace('.', ',') : '');
    setCateringOfferImages(Array.isArray(offer?.imageUrls) ? offer.imageUrls.slice(0, 4) : []);
    setCateringOfferStatus('');
    setCateringOfferFormOpen(true);
    setTimeout(() => scrollRef.current?.scrollTo?.({ y: 0, animated: true }), 0);
  };

  const handleSaveCateringOffer = async () => {
    const nextTitle = cateringOfferTitle.trim();
    const nextDescription = cateringOfferDescription.trim();
    const hasPrice = String(cateringOfferPrice || '').trim().length > 0;
    const nextPrice = hasPrice ? normalizePriceInput(cateringOfferPrice) : null;
    if (nextTitle.length < 2 || nextDescription.length < 2) {
      setCateringOfferStatus('Bitte Titel und Beschreibung ausfüllen.');
      return;
    }
    if (hasPrice && nextPrice === null) {
      setCateringOfferStatus('Bitte einen gültigen Preis eingeben, zum Beispiel 12,50.');
      return;
    }
    const payload = {
      title: nextTitle,
      description: nextDescription,
      price: nextPrice,
      imageUrls: cateringOfferImages.slice(0, 4)
    };
    const saved = editingCateringOffer
      ? await updateRestaurantCateringOffer(editingCateringOffer.id, payload)
      : await createRestaurantCateringOffer(payload);
    if (!saved) {
      setCateringOfferStatus('Catering-Angebot konnte nicht gespeichert werden.');
      return;
    }
    const successMessage = editingCateringOffer ? 'Catering-Angebot gespeichert.' : 'Catering-Angebot erstellt.';
    resetCateringOfferForm();
    setCateringOfferStatus(successMessage);
  };

  const handleToggleCateringOffer = async (offer) => {
    if (!offer?.id) return;
    const saved = await updateRestaurantCateringOffer(offer.id, { active: offer.active === false });
    if (!saved) setCateringOfferStatus('Status konnte nicht geändert werden.');
  };

  const handleDeleteCateringOffer = (offer) => {
    if (!offer?.id) return;
    const remove = async () => {
      const deleted = await removeRestaurantCateringOffer(offer.id);
      if (deleted) setCateringOfferStatus('Catering-Angebot gelöscht.');
    };
    Alert.alert(
      'Catering-Angebot löschen',
      `Willst du „${String(offer.title || 'dieses Angebot')}“ wirklich löschen?`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        { text: 'Löschen', style: 'destructive', onPress: () => void remove() }
      ]
    );
  };

  const handlePickCateringOfferImages = async () => {
    const remaining = 4 - cateringOfferImages.length;
    if (remaining <= 0) {
      setCateringOfferStatus('Maximal vier Bilder pro Catering-Angebot sind möglich.');
      return;
    }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.78,
        allowsEditing: false,
        allowsMultipleSelection: true,
        selectionLimit: remaining,
        legacy: false
      });
      if (result.canceled) return;
      const selectedAssets = (result.assets || []).slice(0, remaining);
      if (!selectedAssets.length) return;
      const uploadedUrls = [];
      for (let index = 0; index < selectedAssets.length; index += 1) {
        const asset = selectedAssets[index];
        setCateringOfferStatus(`Bild ${index + 1} von ${selectedAssets.length} wird hochgeladen...`);
        const imageUrl = await uploadRestaurantCateringImage({
          uri: asset.uri,
          name: asset.fileName || `catering-${Date.now()}-${index + 1}.jpg`,
          mimeType: asset.mimeType || 'image/jpeg',
          file: asset.file
        });
        if (imageUrl) uploadedUrls.push(imageUrl);
      }
      if (uploadedUrls.length) {
        setCateringOfferImages((current) => [...current, ...uploadedUrls].slice(0, 4));
        setCateringOfferStatus(`${uploadedUrls.length} Bild${uploadedUrls.length === 1 ? '' : 'er'} hinzugefügt.`);
      } else {
        setCateringOfferStatus('Bilder konnten nicht hochgeladen werden.');
      }
    } catch (error) {
      setCateringOfferStatus(error?.message || 'Bilder konnten nicht ausgewählt werden.');
    }
  };

  const handleDeleteOrder = (order) => {
    if (!order?.id || order.status === 'pending') return;

    const removeConfirmed = async () => {
      const ok = await removeRestaurantOrder(order.id);
      if (!ok) return;
      setStatus('Bestellung gelöscht.');
    };

    const title = String(order.offerTitle || 'diese Bestellung').trim();
    const prompt = `Willst du "${title}" wirklich löschen?`;

    if (Platform.OS === 'web' && typeof globalThis.confirm === 'function') {
      if (!globalThis.confirm(prompt)) return;
      void removeConfirmed();
      return;
    }

    Alert.alert('Bestellung löschen', prompt, [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: () => {
          void removeConfirmed();
        }
      }
    ]);
  };

  const activeOnboardingStep = restaurantOnboardingSteps[onboardingStepIndex] || restaurantOnboardingSteps[0];
  const onboardingProgressPercent = ((onboardingStepIndex + 1) / restaurantOnboardingSteps.length) * 100;
  const allMealSlotsSelected = settingsSlotList.length === mealSlotOptions.length;
  const reservationModeDisplayLabel =
    reservationModeLabelByKey[settingsReservationMode] || reservationModeLabelByKey.disabled;

  const renderReservationModeChoices = ({ onboarding = false } = {}) => (
    <View
      style={[
        styles.onboardingChoiceGrid,
        isCompactLayout && styles.onboardingChoiceGridCompact
      ]}
    >
      {reservationModeOptions.map((option) => {
        const active =
          settingsReservationMode === option.key && (!onboarding || onboardingReservationChoiceMade);
        const onPress = () => {
          if (onboarding) {
            handleOnboardingReservationChange(option.key);
            return;
          }
          setSettingsReservationMode(option.key);
          setStatus('');
        };

        return (
          <Pressable
            key={`reservation-mode-${onboarding ? 'onboarding' : 'settings'}-${option.key}`}
            style={[
              styles.onboardingChoiceCard,
              isCompactLayout && styles.onboardingChoiceCardCompact,
              active && styles.onboardingChoiceCardActive
            ]}
            onPress={onPress}
          >
            <Text
              style={[
                styles.onboardingChoiceTitle,
                active && styles.onboardingChoiceTitleActive
              ]}
            >
              {option.title}
            </Text>
            <Text style={styles.onboardingChoiceText}>{option.text}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  const renderReservationExternalFields = ({ onboarding = false } = {}) => {
    if (settingsReservationMode !== 'external') {
      return null;
    }

    return (
      <View style={[styles.reservationExternalCard, isSmallPhone && styles.reservationExternalCardSmallPhone]}>
        <Text style={styles.settingsSectionLabel}>Wie sollen Gäste reservieren?</Text>
        <Text style={styles.settingsHint}>
          Mindestens eine Angabe ist nötig. Du kannst Portal-Link, E-Mail und Telefon auch kombinieren.
        </Text>
        <TextInput
          value={settingsReservationExternalLink}
          onChangeText={handleReservationExternalLinkChange}
          placeholder="Reservierungsportal-Link"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          style={[styles.input, compactInputStyle]}
        />
        <TextInput
          value={settingsReservationExternalEmail}
          onChangeText={handleReservationExternalEmailChange}
          placeholder="Reservierungs-E-Mail"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          style={[styles.input, compactInputStyle]}
        />
        <TextInput
          value={settingsReservationExternalPhone}
          onChangeText={handleReservationExternalPhoneChange}
          placeholder="Reservierungs-Telefon"
          keyboardType="phone-pad"
          style={[styles.input, compactInputStyle, styles.reservationExternalPhoneInput]}
        />
        {onboarding ? (
          <Text style={styles.settingsCollapsedHint}>
            Gäste sehen später direkte Buttons wie Portal öffnen, E-Mail senden oder Anrufen.
          </Text>
        ) : null}
      </View>
    );
  };

  const formatOpeningPeriod = (period) => {
    const open = normalizeTimeInput(period?.openTime, DEFAULT_OPEN_TIME);
    const close = normalizeTimeInput(period?.closeTime, DEFAULT_CLOSE_TIME);
    return `${open}–${close}${toMinutes(close) <= toMinutes(open) ? ' · nächster Tag' : ''}`;
  };

  const openingHoursGuestSummary = openingHourDays
    .filter((day) => settingsOpeningHours?.[day.key]?.enabled)
    .map((day) => {
      const entry = settingsOpeningHours[day.key];
      const periods = normalizeOpeningPeriods(entry?.periods, entry?.openTime, entry?.closeTime, true);
      const firstPeriod = periods[0];
      const ranges = entry?.openEnded && firstPeriod
        ? [`${firstPeriod.openTime}–Ende`, ...periods.slice(1).map(formatOpeningPeriod)]
        : periods.map(formatOpeningPeriod);
      return `${day.shortLabel}: ${ranges.join(' · ')}`;
    });

  const renderOpeningTimeField = (dayKey, periodIndex, field) => {
    const day = settingsOpeningHours?.[dayKey];
    const period = normalizeOpeningPeriods(day?.periods, day?.openTime, day?.closeTime, true)[periodIndex];
    const fallback = field === 'openTime' ? DEFAULT_OPEN_TIME : DEFAULT_CLOSE_TIME;
    const value = normalizeTimeInput(period?.[field], fallback);
    const isOpenEnded = field === 'closeTime' && periodIndex === 0 && Boolean(day?.openEnded);
    const isNextDay = !isOpenEnded && field === 'closeTime' && toMinutes(value) <= toMinutes(period?.openTime);
    return (
      <Pressable
        style={styles.openingDayTimeButton}
        onPress={() => openTimePicker(dayKey, periodIndex, field)}
      >
        <Text style={styles.openingDayTimeCaption}>{field === 'openTime' ? 'ÖFFNET' : 'SCHLIESST'}</Text>
        <Text style={styles.openingDayTimeValue}>{isOpenEnded ? 'Bis Ende' : value}</Text>
        {isNextDay ? <Text style={styles.openingDayTimeNextDay}>nächster Tag</Text> : null}
      </Pressable>
    );
  };

  const renderOpeningHoursEditor = ({ showSpecialClosures = false } = {}) => (
    <View style={styles.openingHoursList}>
      <Text style={styles.settingsHint}>Lege für jeden Tag fest, ob dein Restaurant geöffnet ist.</Text>
      {openingHourDays.map((day) => {
        const entry = settingsOpeningHours?.[day.key] || createDefaultOpeningHours()[day.key];
        const periods = normalizeOpeningPeriods(entry.periods, entry.openTime, entry.closeTime, entry.enabled);
        return (
          <View key={`opening-day-${day.key}`} style={styles.openingDayCard}>
            <View style={styles.openingDayHeader}>
              <View>
                <Text style={styles.openingDayLabel}>{day.label}</Text>
                <Text style={styles.openingDayState}>{entry.enabled ? 'Geöffnet' : 'Geschlossen'}</Text>
              </View>
              <Pressable
                style={[styles.openingDayToggle, entry.enabled && styles.openingDayToggleOn]}
                onPress={() => setOpeningDayEnabled(day.key, !entry.enabled)}
                accessibilityRole="switch"
                accessibilityState={{ checked: entry.enabled }}
                accessibilityLabel={`${day.label} ${entry.enabled ? 'geöffnet' : 'geschlossen'}`}
              >
                <View style={[styles.openingDayToggleThumb, entry.enabled && styles.openingDayToggleThumbOn]} />
              </Pressable>
            </View>
            {entry.enabled ? (
              <>
                {periods.map((period, periodIndex) => (
                  <View key={`${day.key}-period-${periodIndex}`} style={styles.openingDayPeriod}>
                    <View style={styles.openingDayTimePair}>
                      {renderOpeningTimeField(day.key, periodIndex, 'openTime')}
                      <Text style={styles.openingDayTimeDivider}>bis</Text>
                      {renderOpeningTimeField(day.key, periodIndex, 'closeTime')}
                    </View>
                  </View>
                ))}
                {periods.length < 2 ? (
                  <Pressable style={styles.openingDaySecondTimeButton} onPress={() => addOpeningPeriod(day.key)}>
                    <Ionicons name="add" size={17} color={colors.accent} />
                    <Text style={styles.openingDaySecondTimeText}>Mittagspause / zweite Zeit</Text>
                  </Pressable>
                ) : (
                  <Pressable style={styles.openingDayRemovePauseButton} onPress={() => removeOpeningPeriod(day.key)}>
                    <Ionicons name="close" size={17} color={colors.accentWarm} />
                    <Text style={styles.openingDayRemovePauseText}>Pause entfernen</Text>
                  </Pressable>
                )}
              </>
            ) : null}
          </View>
        );
      })}

      <View style={styles.openingGuestSummaryCard}>
        <Text style={styles.openingGuestSummaryEyebrow}>SO SEHEN ES DEINE GÄSTE</Text>
        {openingHoursGuestSummary.length ? (
          openingHoursGuestSummary.map((entry) => (
            <Text key={entry} style={styles.openingGuestSummaryText}>{entry}</Text>
          ))
        ) : (
          <Text style={styles.openingGuestSummaryText}>Noch keine Öffnungszeiten festgelegt.</Text>
        )}
      </View>

      <Modal
        visible={timePickerState.visible}
        transparent
        animationType="slide"
        onRequestClose={closeTimePicker}
      >
        <View style={styles.openingTimeSheetBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeTimePicker} />
          <View style={[styles.openingTimeSheet, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
            <View style={styles.openingTimeSheetHandle} />
            <Text style={styles.openingTimeSheetTitle}>
              {timePickerState.field === 'closeTime' ? 'Schließt um' : 'Öffnet um'}
            </Text>
            <Text style={styles.openingTimeSheetSubtitle}>
              {openingHourDays.find((day) => day.key === timePickerState.dayKey)?.label || ''}
            </Text>
            <ScrollView ref={openingTimePickerScrollRef} style={styles.openingTimeSheetScroll} contentContainerStyle={styles.openingTimeSheetGrid}>
              {openingTimeOptions.map((time) => {
                const day = settingsOpeningHours?.[timePickerState.dayKey];
                const period = normalizeOpeningPeriods(day?.periods, day?.openTime, day?.closeTime, true)[timePickerState.periodIndex];
                const nextDay = timePickerState.field === 'closeTime' && toMinutes(time) <= toMinutes(period?.openTime);
                const selected = time === timePickerState.value;
                return (
                  <Pressable
                    key={time}
                    style={[styles.openingTimeOption, selected && styles.openingTimeOptionSelected]}
                    onPress={() => applyPickedTime(time)}
                  >
                    <Text style={[styles.openingTimeOptionText, selected && styles.openingTimeOptionTextSelected]}>{time}</Text>
                    {nextDay ? <Text style={[styles.openingTimeOptionHint, selected && styles.openingTimeOptionHintSelected]}>nächster Tag</Text> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable style={styles.openingTimeSheetCancel} onPress={closeTimePicker}>
              <Text style={styles.openingTimeSheetCancelText}>Abbrechen</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {showSpecialClosures ? (
        <View style={[styles.specialClosureCard, isSmallPhone && styles.specialClosureCardSmallPhone]}>
          <Text style={styles.settingsSectionLabel}>Schließtage</Text>
          <Text style={styles.settingsHint}>
            Für Feiertage, Krankheit oder andere Ausnahmen kannst du einzelne Tage als geschlossen markieren.
          </Text>
          <Pressable
            style={styles.specialClosureDateButton}
            onPress={() => setSettingsSpecialClosurePickerOpen((open) => !open)}
          >
            <Ionicons name="calendar-outline" size={17} color={colors.accent} />
            <Text
              style={[
                styles.specialClosureDateButtonText,
                !settingsSpecialClosureDate && styles.specialClosureDateButtonPlaceholder
              ]}
            >
              {selectedSpecialClosureLabel}
            </Text>
            <Ionicons
              name={settingsSpecialClosurePickerOpen ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={colors.muted}
            />
          </Pressable>
          {settingsSpecialClosurePickerOpen ? (
            <View style={styles.specialClosureInlinePicker}>
              <ScrollView
                style={styles.specialClosureInlineScroll}
                contentContainerStyle={styles.specialClosurePickerScrollContent}
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}
              >
                {specialClosureDateOptions.map((option) => (
                  <Pressable
                    key={option.key}
                    style={[
                      styles.specialClosurePickerRow,
                      settingsSpecialClosureDate === option.key && styles.specialClosurePickerRowActive
                    ]}
                    onPress={() => {
                      setSettingsSpecialClosureDate(option.key);
                      setSettingsSpecialClosurePickerOpen(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.specialClosurePickerRowText,
                        settingsSpecialClosureDate === option.key && styles.specialClosurePickerRowTextActive
                      ]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}
          <TextInput
            value={settingsSpecialClosureReason}
            onChangeText={setSettingsSpecialClosureReason}
            placeholder="z. B. Feiertag, Betriebsferien oder krank"
            maxLength={200}
            style={[styles.input, compactInputStyle]}
          />
          <Pressable
            style={[styles.outlineButton, isSmallPhone && styles.buttonCompactSmallPhone]}
            onPress={handleAddSpecialClosure}
          >
            <Text style={styles.outlineButtonText}>Schließtag hinzufügen</Text>
          </Pressable>

          {settingsSpecialClosures.length ? (
            <View style={styles.specialClosureList}>
              {settingsSpecialClosures.map((entry) => (
                <View
                  key={entry.date}
                  style={[
                    styles.specialClosureRow,
                    isSmallPhone && styles.specialClosureRowSmallPhone
                  ]}
                >
                  <View style={styles.specialClosureTextWrap}>
                    <Text style={styles.specialClosureDateText}>{formatIsoDateLabel(entry.date)}</Text>
                    <Text style={styles.specialClosureReasonText}>{entry.reason}</Text>
                  </View>
                  <Pressable
                    style={styles.specialClosureRemoveButton}
                    onPress={() => handleRemoveSpecialClosure(entry.date)}
                  >
                    <Ionicons name="trash-outline" size={15} color={colors.accentWarm} />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.specialClosureEmpty}>Noch keine Schließtage hinterlegt.</Text>
          )}
        </View>
      ) : null}
    </View>
  );

  const renderOnboardingStepContent = () => {
    if (activeOnboardingStep.key === 'mealSlots') {
      return (
        <View style={[styles.card, compactCardStyle]}>
          <Text style={[styles.cardTitle, compactCardTitleStyle]}>Welche Bereiche möchtest du anbieten?</Text>
          <Text style={[styles.helperText, compactHelperTextStyle]}>
            Wähle aus, wann Gäste dein Restaurant sehen sollen.
          </Text>
          <View style={styles.settingsMealSlotRow}>
            {mealSlotOptions.map((option) => (
              <MealSlotChip
                key={`onboarding-slot-${option.key}`}
                label={option.label}
                active={settingsSlotList.includes(option.key)}
                onPress={() =>
                  setSettingsMealSlots((prev) => toggleMealSlot(normalizeMealSlots(prev), option.key))
                }
              />
            ))}
            <MealSlotChip
              label="Alle Bereiche"
              active={allMealSlotsSelected}
              onPress={() =>
                setSettingsMealSlots(allMealSlotsSelected ? [] : mealSlotOptions.map((option) => option.key))
              }
            />
          </View>
        </View>
      );
    }

    if (activeOnboardingStep.key === 'cuisine') {
      return (
        <View style={[styles.card, compactCardStyle]}>
          <Text style={[styles.cardTitle, compactCardTitleStyle]}>Welche Küche bietet dein Restaurant an?</Text>
          <Text style={[styles.helperText, compactHelperTextStyle]}>Mehrere Angaben sind möglich.</Text>
          <View style={styles.cuisineRow}>
            {cuisineTypeOptions.map((cuisine) => (
              <Pressable
                key={`onboarding-cuisine-${cuisine}`}
                style={[
                  styles.cuisineChip,
                  settingsCuisineTypes.includes(cuisine) && styles.cuisineChipActive
                ]}
                onPress={() => toggleCuisineType(cuisine)}
              >
                <Text
                  style={[
                    styles.cuisineChipText,
                    settingsCuisineTypes.includes(cuisine) && styles.cuisineChipTextActive
                  ]}
                >
                  {cuisine}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      );
    }

    if (activeOnboardingStep.key === 'reservations') {
      return (
        <View style={[styles.card, compactCardStyle]}>
          <Text style={[styles.cardTitle, compactCardTitleStyle]}>Wie möchtest du Tischreservierungen anbieten?</Text>
          <Text style={[styles.helperText, compactHelperTextStyle]}>
            Wähle, ob Gäste direkt in der App reservieren oder lieber extern über Portal, E-Mail oder Telefon.
          </Text>
          {renderReservationModeChoices({ onboarding: true })}
          {renderReservationExternalFields({ onboarding: true })}
        </View>
      );
    }

    if (activeOnboardingStep.key === 'openingHours') {
      return (
        <View style={[styles.card, compactCardStyle]}>
          <Text style={[styles.cardTitle, compactCardTitleStyle]}>Wann hat dein Restaurant geöffnet?</Text>
          {renderOpeningHoursEditor()}
        </View>
      );
    }

    if (activeOnboardingStep.key === 'about') {
      return (
        <View style={[styles.card, compactCardStyle]}>
          <Text style={[styles.cardTitle, compactCardTitleStyle]}>
            Möchtest du ein paar Wörter über dein Restaurant schreiben? Was macht euch besonders?
          </Text>
          <Text style={[styles.helperText, compactHelperTextStyle]}>Dieser Schritt ist optional.</Text>
          <TextInput
            value={settingsAboutText}
            onChangeText={setSettingsAboutText}
            placeholder="Erzähl kurz etwas über euer Restaurant, Spezialitäten oder Atmosphäre."
            multiline
            blurOnSubmit
            maxLength={2000}
            returnKeyType="done"
            submitBehavior="blurAndSubmit"
            onSubmitEditing={Keyboard.dismiss}
            style={[styles.input, compactInputStyle, styles.textArea, compactTextAreaStyle, styles.settingsAboutInput]}
          />
        </View>
      );
    }

    if (activeOnboardingStep.key === 'menu') {
      return (
        <View style={[styles.card, compactCardStyle]}>
          <Text style={[styles.cardTitle, compactCardTitleStyle]}>Speisekarten optional</Text>
          <Text style={[styles.helperText, compactHelperTextStyle]}>
            Hier kannst du deine normale Speisekarte und deine Mittagstisch-Karte hochladen, falls du eine hast.
            Wenn du das später machen möchtest, kannst du diesen Schritt überspringen und beide Karten später
            unter „Mein Menü“ hochladen.
          </Text>
          <View style={styles.registerMenuUploadCard}>
            <Pressable
              style={[styles.menuToggleButton, styles.menuToggleButtonPdf]}
              onPress={() => setOnboardingRegularMenuOpen((previous) => !previous)}
            >
              <View style={styles.menuToggleButtonLeft}>
                <Ionicons name="restaurant-outline" size={18} color={colors.white} />
                <Text style={styles.menuToggleButtonText}>Normale Speisekarte</Text>
              </View>
              <Ionicons
                name={onboardingRegularMenuOpen ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={colors.white}
              />
            </Pressable>
          {onboardingRegularMenuOpen ? (
            <>
          <Text style={[styles.helperText, compactHelperTextStyle]}>
            Du kannst einfach ein Bild, mehrere Bilder oder eine PDF-Datei deiner Karte hochladen.
            Unsere KI-Bilderkennung erstellt daraus innerhalb von ca. 2 Minuten ein komplettes
            digitales Menü für dich.
          </Text>
          <Text style={[styles.helperText, compactHelperTextStyle]}>
            Wenn deine Karte aus mehreren Seiten besteht, fotografiere bitte zuerst alle Seiten
            und lade danach alle Bilder zusammen hoch.
          </Text>
          <Text style={[styles.helperText, compactHelperTextStyle]}>
            Falls jetzt nicht: Du kannst deine Karte später unter Mein Menü hochladen. Ohne Karte
            können Nutzer keine Gerichte von dir sehen.
          </Text>
          <Pressable
            style={[
              styles.imageButton,
              styles.digitalMenuPrimaryButton,
              (digitalMenuLoading || menuPickerInProgress) && styles.digitalMenuPrimaryButtonDisabled
            ]}
            onPress={handleGenerateDigitalMenu}
            disabled={digitalMenuLoading || menuPickerInProgress}
          >
            <Ionicons name="sparkles" size={18} color={colors.accent} />
            <Text style={[styles.imageButtonText, styles.digitalMenuPrimaryButtonText]}>
              {digitalMenuLoading ? 'Bitte warten Sie. Ihre Karte wird nun erstellt.' : 'Speisekarte hochladen'}
            </Text>
          </Pressable>

          {menuFiles.length ? (
            <View style={styles.menuFileList}>
              {menuFiles.map((entry, index) => (
                <View key={entry.id || `${entry.url}-${index}`} style={styles.menuFileRow}>
                  <Text style={styles.menuFileName} numberOfLines={1}>
                    {entry.name || 'menu'}
                  </Text>
                  <Pressable style={styles.menuFileShowButton} onPress={() => handleOpenMenu(entry)}>
                    <Text style={styles.menuFileShowButtonText}>Anzeigen</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}

          {digitalMenuStatus ? <Text style={styles.status}>{digitalMenuStatus}</Text> : null}
          {digitalMenuError ? <Text style={styles.errorText}>{digitalMenuError}</Text> : null}

          {hasRecognizedDigitalMenuItems ? (
            <>
              <View style={styles.digitalDietFilterRow}>
                {digitalDietFilterOptions.map((option) => (
                  <MealSlotChip
                    key={`onboarding-digital-diet-${option.key}`}
                    label={option.label}
                    active={digitalMenuDietFilter === option.key}
                    compact
                    tiny
                    onPress={() => setDigitalMenuDietFilter(option.key)}
                  />
                ))}
              </View>
              <View style={styles.digitalMenuList}>
                {groupedDigitalMenu.map((group) => (
                  <View key={`onboarding-group-${group.section}`} style={styles.digitalCategoryBlock}>
                    <Text
                      style={[
                        styles.digitalCategoryTitle,
                        styles[`digitalCategoryTitleTone${detectMenuSectionTone(group.section)}`]
                      ]}
                    >
                      {group.section}
                    </Text>
                    {group.items.length ? (
                      group.items.map((item) => (
                        <Pressable
                          key={item.id}
                          style={styles.digitalListRow}
                          onPress={() => openMenuItemEditor(item)}
                          >
                            <View style={styles.digitalListHead}>
                              <View style={styles.digitalListNameWrap}>
                                <Text style={styles.digitalListName}>{item.name}</Text>
                                <MenuCategoryBadge category={item.category} />
                              </View>
                            <Text style={styles.digitalListPrice}>{toPriceText(item.priceText)} EUR</Text>
                          </View>
                          {item.description ? (
                            <Text style={styles.digitalListDescription}>{item.description}</Text>
                          ) : null}
                        </Pressable>
                      ))
                    ) : (
                      <Text style={styles.digitalListEmpty}>Keine Gerichte.</Text>
                    )}
                  </View>
                ))}
              </View>

              <View style={styles.digitalAllergenCard}>
                <Text style={[styles.sectionLabel, compactSectionLabelStyle]}>Allergene</Text>
                <Text style={[styles.helperText, compactHelperTextStyle]}>
                  KI erkennt Allergene automatisch. Bei Unsicherheit hier manuell ergänzen oder
                  korrigieren.
                </Text>
                <TextInput
                  value={digitalMenuAllergensText}
                  onChangeText={handleDigitalAllergensChange}
                  placeholder="z. B. Gluten, Milch, Eier (je Zeile ein Eintrag)"
                  style={[
                    styles.input,
                    compactInputStyle,
                    styles.textArea,
                    compactTextAreaStyle,
                    styles.digitalAllergenInput
                  ]}
                  multiline
                />
              </View>

              <View style={styles.digitalGlobalActions}>
                <View
                  style={[
                    styles.digitalGlobalActionsRow,
                    isCompactLayout && styles.digitalGlobalActionsRowCompact,
                    isSmallPhone && styles.digitalGlobalActionsRowSmallPhone
                  ]}
                >
                  <Pressable
                    style={[
                      styles.digitalActionButton,
                      isCompactLayout && styles.digitalActionButtonCompact,
                      styles.digitalActionButtonAdd,
                      digitalMenuSaving && styles.digitalActionButtonDisabled
                    ]}
                    onPress={() => openMenuItemEditor(null)}
                    disabled={digitalMenuSaving}
                  >
                    <View style={[styles.buttonIconRow, isCompactLayout && styles.buttonIconRowCompact]}>
                      <Ionicons name="add-circle-outline" size={isCompactLayout ? 14 : 15} color={colors.accent} />
                      <Text
                        numberOfLines={2}
                        style={[
                          styles.digitalActionButtonText,
                          isCompactLayout && styles.digitalActionButtonTextCompact,
                          styles.digitalActionButtonTextAdd
                        ]}
                      >
                        Hinzufügen
                      </Text>
                    </View>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.digitalActionButton,
                      isCompactLayout && styles.digitalActionButtonCompact,
                      styles.digitalActionButtonSave,
                      digitalMenuSaving && styles.digitalActionButtonDisabled
                    ]}
                    onPress={handleSaveDigitalMenu}
                    disabled={digitalMenuSaving}
                  >
                    <View style={[styles.buttonIconRow, isCompactLayout && styles.buttonIconRowCompact]}>
                      <Ionicons name="save-outline" size={isCompactLayout ? 14 : 15} color={colors.white} />
                      <Text
                        numberOfLines={2}
                        style={[
                          styles.digitalActionButtonText,
                          isCompactLayout && styles.digitalActionButtonTextCompact
                        ]}
                      >
                        {digitalMenuSaving ? (isCompactLayout ? 'Warten...' : 'Bitte warten...') : 'Speichern'}
                      </Text>
                    </View>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.digitalActionButton,
                      isCompactLayout && styles.digitalActionButtonCompact,
                      styles.digitalActionButtonDelete,
                      digitalMenuSaving && styles.digitalActionButtonDisabled
                    ]}
                    onPress={() => confirmClearDigitalMenu('normal')}
                    disabled={digitalMenuSaving}
                  >
                    <View style={[styles.buttonIconRow, isCompactLayout && styles.buttonIconRowCompact]}>
                      <Ionicons name="trash-outline" size={isCompactLayout ? 14 : 15} color={colors.white} />
                      <Text
                        numberOfLines={2}
                        style={[
                          styles.digitalActionButtonText,
                          isCompactLayout && styles.digitalActionButtonTextCompact
                        ]}
                      >
                        {digitalMenuSaving ? (isCompactLayout ? 'Warten...' : 'Bitte warten...') : 'Löschen'}
                      </Text>
                    </View>
                  </Pressable>
                </View>
              </View>
            </>
          ) : null}
            </>
          ) : null}
          </View>

          <View style={styles.registerMenuUploadCard}>
            <Pressable
              style={[
                styles.menuToggleButton,
                styles.menuToggleButtonKi,
                styles.menuToggleButtonPrimary
              ]}
              onPress={() => setOnboardingLunchMenuOpen((previous) => !previous)}
            >
              <View style={styles.menuToggleButtonLeft}>
                <Ionicons name="sunny-outline" size={18} color={colors.white} />
                <Text style={styles.menuToggleButtonText}>Mittagstisch-Karte</Text>
              </View>
              <Ionicons
                name={onboardingLunchMenuOpen ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={colors.white}
              />
            </Pressable>
            {onboardingLunchMenuOpen ? (
              <>
                <Text style={[styles.helperText, compactHelperTextStyle]}>
                  Lade PDF oder Bilder hoch. Standardmäßig gelten alle Gerichte täglich (Mo-So).
                  Du kannst die Wochentage danach pro Gericht einschränken.
                </Text>
                <Pressable
                  style={[
                    styles.imageButton,
                    styles.digitalMenuPrimaryButton,
                    (lunchMenuLoading || menuPickerInProgress) && styles.digitalMenuPrimaryButtonDisabled
                  ]}
                  onPress={() => handleGenerateDigitalMenu('lunch')}
                  disabled={lunchMenuLoading || menuPickerInProgress}
                >
                  <Ionicons name="sparkles" size={18} color={colors.accent} />
                  <Text style={[styles.imageButtonText, styles.digitalMenuPrimaryButtonText]}>
                    {lunchMenuLoading
                      ? 'Bitte warten Sie. Ihre Karte wird nun erstellt.'
                      : 'Mittagstisch-Karte hochladen'}
                  </Text>
                </Pressable>

                {uploadedLunchMenuFiles.length ? (
                  <View style={styles.menuFileList}>
                    {uploadedLunchMenuFiles.map((entry, index) => (
                      <View key={entry.id || `${entry.url}-${index}`} style={styles.menuFileRow}>
                        <Text style={styles.menuFileName} numberOfLines={1}>
                          {entry.name || `mittagskarte-${index + 1}`}
                        </Text>
                        <Pressable style={styles.menuFileShowButton} onPress={() => handleOpenMenu(entry)}>
                          <Text style={styles.menuFileShowButtonText}>Anzeigen</Text>
                        </Pressable>
                      </View>
                    ))}
                  </View>
                ) : null}

                {lunchMenuStatus ? <Text style={styles.status}>{lunchMenuStatus}</Text> : null}
                {lunchMenuError ? <Text style={styles.errorText}>{lunchMenuError}</Text> : null}

                {hasRecognizedLunchMenuItems ? (
                  <>
                    <View style={styles.lunchValidityCard}>
                      <View style={styles.lunchValidityHeaderRow}>
                        <View style={styles.lunchValidityHeaderText}>
                          <Text style={styles.lunchValidityTitle}>Zeitraum der Mittagstisch-Karte</Text>
                          <Text
                            style={[
                              styles.lunchValiditySummary,
                              lunchValiditySummary.pendingCount > 0 && styles.lunchValiditySummaryPending
                            ]}
                          >
                            {lunchValiditySummary.text}
                          </Text>
                        </View>
                        <Pressable
                          style={styles.lunchValidityChangeButton}
                          onPress={() => openLunchValidityEditor('all', lunchMenuDraft, false)}
                        >
                          <Text style={styles.lunchValidityChangeButtonText}>
                            {lunchValiditySummary.pendingCount > 0 ? 'Datum festlegen' : 'Zeitraum ändern'}
                          </Text>
                        </Pressable>
                      </View>
                      <Text style={[styles.helperText, compactHelperTextStyle]}>
                        Datum für diesen Mittagstisch festlegen. Einzelne Gerichte kannst du später unter
                        „Mein Menü“ ändern.
                      </Text>
                    </View>
                    <View style={styles.digitalMenuList}>
                      {groupedLunchMenu.map((group) => (
                        <View key={`onboarding-lunch-${group.section}`} style={styles.digitalCategoryBlock}>
                          <Text
                            style={[
                              styles.digitalCategoryTitle,
                              styles[`digitalCategoryTitleTone${detectMenuSectionTone(group.section)}`]
                            ]}
                          >
                            {group.section}
                          </Text>
                          {group.items.map((item) => (
                            <Pressable
                              key={item.id}
                              style={styles.digitalListRow}
                              onPress={() => openMenuItemEditor(item, 'lunch')}
                            >
                              <View style={styles.digitalListHead}>
                                <View style={styles.digitalListNameWrap}>
                                  <Text style={styles.digitalListName}>{item.name}</Text>
                                  <MenuCategoryBadge category={item.category} />
                                </View>
                                <Text style={styles.digitalListPrice}>{toPriceText(item.priceText)} EUR</Text>
                              </View>
                              {item.description ? (
                                <Text style={styles.digitalListDescription}>{item.description}</Text>
                              ) : null}
                              <Text style={[styles.helperText, compactHelperTextStyle]}>
                                {formatLunchScheduleText(item)}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                      ))}
                    </View>
                    <View style={styles.digitalAllergenCard}>
                      <Text style={[styles.sectionLabel, compactSectionLabelStyle]}>Allergene</Text>
                      <TextInput
                        value={lunchMenuAllergensText}
                        onChangeText={(value) => handleDigitalAllergensChange(value, 'lunch')}
                        placeholder="z. B. Gluten, Milch, Eier (je Zeile ein Eintrag)"
                        style={[
                          styles.input,
                          compactInputStyle,
                          styles.textArea,
                          compactTextAreaStyle,
                          styles.digitalAllergenInput
                        ]}
                        multiline
                      />
                    </View>
                  </>
                ) : null}

                <View style={styles.digitalGlobalActions}>
                  <View style={[styles.digitalGlobalActionsRow, isCompactLayout && styles.digitalGlobalActionsRowCompact]}>
                    <Pressable
                      style={[styles.digitalActionButton, styles.digitalActionButtonAdd]}
                      onPress={() => openMenuItemEditor(null, 'lunch')}
                      disabled={lunchMenuSaving}
                    >
                      <Text style={[styles.digitalActionButtonText, styles.digitalActionButtonTextAdd]}>Hinzufügen</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.digitalActionButton, styles.digitalActionButtonSave]}
                      onPress={() => handleSaveDigitalMenu('lunch')}
                      disabled={lunchMenuSaving}
                    >
                      <Text style={styles.digitalActionButtonText}>
                        {lunchMenuSaving ? 'Warten...' : 'Speichern'}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.digitalActionButton, styles.digitalActionButtonDelete]}
                      onPress={() => confirmClearDigitalMenu('lunch')}
                      disabled={lunchMenuSaving}
                    >
                      <Text style={styles.digitalActionButtonText}>Löschen</Text>
                    </Pressable>
                  </View>
                </View>
              </>
            ) : null}
          </View>
        </View>
      );
    }

    return (
        <View style={[styles.card, compactCardStyle]}>
          <Text style={[styles.cardTitle, compactCardTitleStyle]}>Passt alles für dich?</Text>
          <Text style={[styles.helperText, compactHelperTextStyle]}>
            Prüfe deine Angaben. Danach wird die Einrichtung gespeichert.
          </Text>
        <View style={styles.onboardingSummaryList}>
          <View style={styles.onboardingSummaryRow}>
            <Text style={styles.onboardingSummaryLabel}>Bereiche</Text>
            <Text style={styles.onboardingSummaryValue}>
              {settingsSlotList.length
                ? settingsSlotList.map((slot) => mealSlotLabelByKey[slot] || slot).join(', ')
                : 'Nicht angegeben'}
            </Text>
          </View>
          <View style={styles.onboardingSummaryRow}>
            <Text style={styles.onboardingSummaryLabel}>Küche</Text>
            <Text style={styles.onboardingSummaryValue}>
              {settingsCuisineTypes.length ? settingsCuisineTypes.join(', ') : 'Nicht angegeben'}
            </Text>
          </View>
          <View style={styles.onboardingSummaryRow}>
            <Text style={styles.onboardingSummaryLabel}>Tischreservierung</Text>
            <Text style={styles.onboardingSummaryValue}>
              {reservationModeDisplayLabel}
            </Text>
          </View>
          {settingsReservationMode === 'external' ? (
            <View style={styles.onboardingSummaryRow}>
              <Text style={styles.onboardingSummaryLabel}>Externe Kontakte</Text>
              <Text style={styles.onboardingSummaryValue}>
                {[
                  settingsReservationExternalLink.trim() ? 'Portal' : '',
                  settingsReservationExternalEmail.trim() ? 'E-Mail' : '',
                  settingsReservationExternalPhone.trim() ? 'Telefon' : ''
                ]
                  .filter(Boolean)
                  .join(', ') || 'Nicht angegeben'}
              </Text>
            </View>
          ) : null}
          <View style={styles.onboardingSummaryRow}>
            <Text style={styles.onboardingSummaryLabel}>Öffnungszeiten</Text>
            <Text style={styles.onboardingSummaryValue}>
              {activeOpeningDayCount ? `${activeOpeningDayCount} Tage geöffnet` : 'Nicht angegeben'}
            </Text>
          </View>
          <View style={styles.onboardingSummaryRow}>
            <Text style={styles.onboardingSummaryLabel}>Über uns</Text>
            <Text style={styles.onboardingSummaryValue}>
              {settingsAboutText.trim() ? settingsAboutText.trim() : 'Leer'}
            </Text>
          </View>
          <View style={styles.onboardingSummaryRow}>
            <Text style={styles.onboardingSummaryLabel}>Normale Speisekarte</Text>
            <Text style={styles.onboardingSummaryValue}>
              {menuFiles.length || digitalMenuDraft.items.length
                ? `${menuFiles.length} Datei(en), ${digitalMenuDraft.items.length} erkannte Gerichte`
                : 'Noch nicht hochgeladen. Später unter Mein Menü möglich.'}
            </Text>
          </View>
          <View style={styles.onboardingSummaryRow}>
            <Text style={styles.onboardingSummaryLabel}>Mittagstisch-Karte</Text>
            <Text style={styles.onboardingSummaryValue}>
              {uploadedLunchMenuFiles.length || lunchMenuDraft.items.length
                ? `${uploadedLunchMenuFiles.length} Datei(en), ${lunchMenuDraft.items.length} erkannte Gerichte`
                : 'Noch nicht hochgeladen. Später unter Mein Menü möglich.'}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  const renderRestaurantOnboarding = () => {
    const onboardingActionRowSmallPhone = (
      <View style={styles.onboardingHeroActionsInlineSmallPhone}>
        {onBack ? (
          <Pressable
            style={styles.onboardingHomeButtonSmallPhone}
            onPress={onBack}
          >
            <View style={styles.onboardingHomeButtonContentSmallPhone}>
              <Ionicons name="home-outline" size={14} color={colors.accent} />
              <Text style={styles.onboardingHomeButtonTextSmallPhone} numberOfLines={1}>
                Hauptseite
              </Text>
            </View>
          </Pressable>
        ) : null}
        <Pressable
          style={styles.onboardingLogoutIconButtonSmallPhone}
          onPress={logout}
          accessibilityLabel="Abmelden"
        >
          <Ionicons name="person-outline" size={16} color={colors.accent} />
        </Pressable>
      </View>
    );

    const onboardingHeader = (
      <View style={[styles.onboardingHero, isSmallPhone && styles.onboardingHeroSmallPhone]}>
        <View style={[styles.onboardingHeroTop, isSmallPhone && styles.onboardingHeroTopSmallPhone]}>
          <View
            style={[
              styles.header,
              isSmallPhone && styles.headerSmallPhone,
              isSmallPhone && styles.onboardingHeaderSmallPhone
            ]}
          >
            <View style={[styles.brandMark, isSmallPhone && styles.brandMarkSmallPhone]}>
              <Image source={appIcon} style={[styles.logoImage, isSmallPhone && styles.logoImageSmallPhone]} />
            </View>
            <View style={[styles.headerText, isSmallPhone && styles.onboardingHeaderTextSmallPhone]}>
              <View
                style={[
                  styles.onboardingHeroTitleRowSmallPhone,
                  !isSmallPhone && styles.onboardingHeroTitleRowDefault
                ]}
              >
                <View style={styles.onboardingHeroTitleTextWrapSmallPhone}>
                  <Text style={styles.onboardingHeroEyebrow}>Einrichtung</Text>
                  <Text style={[styles.subtitle, isSmallPhone && styles.subtitleSmallPhone]}>
                    Hallo {restaurant?.name}
                  </Text>
                </View>
                {isSmallPhone ? onboardingActionRowSmallPhone : null}
              </View>
              <Text
                style={[
                  styles.onboardingHeroText,
                  isSmallPhone && styles.onboardingHeroTextSmallPhone
                ]}
              >
                Wir richten dein Restaurant jetzt Schritt für Schritt mit dir ein.
              </Text>
            </View>
          </View>
          {!isSmallPhone ? (
            <View
              style={[
                styles.onboardingHeroActions,
                isSmallPhone && styles.onboardingHeroActionsSmallPhone
              ]}
            >
              {onBack ? (
                <Pressable
                  style={[
                    styles.outlineButton,
                    styles.topInlineOutlineButton,
                    isSmallPhone && styles.topInlineOutlineButtonSmallPhone
                  ]}
                  onPress={onBack}
                >
                  <View
                    style={[
                      styles.inlineButtonContent,
                      isSmallPhone && styles.inlineButtonContentSmallPhone
                    ]}
                  >
                    <Ionicons name="home-outline" size={16} color={colors.accent} />
                    <Text style={styles.outlineButtonText}>Zur Hauptseite</Text>
                  </View>
                </Pressable>
              ) : null}
              <Pressable
                style={[
                  styles.outlineButton,
                  styles.topInlineOutlineButton,
                  isSmallPhone && styles.topInlineOutlineButtonSmallPhone
                ]}
                onPress={logout}
              >
                <View
                  style={[
                    styles.inlineButtonContent,
                    isSmallPhone && styles.inlineButtonContentSmallPhone
                  ]}
                >
                  <Ionicons name="log-out-outline" size={16} color={colors.accent} />
                  <Text style={styles.outlineButtonText}>Abmelden</Text>
                </View>
              </Pressable>
            </View>
          ) : null}
        </View>

        <View
          style={[
            styles.onboardingProgressCard,
            isSmallPhone && styles.onboardingProgressCardSmallPhone
          ]}
        >
          <View style={styles.onboardingProgressHeader}>
            <Text style={styles.onboardingProgressStep}>
              Schritt {onboardingStepIndex + 1} von {restaurantOnboardingSteps.length}
            </Text>
            <Text
              style={[
                styles.onboardingProgressTitle,
                isSmallPhone && styles.onboardingProgressTitleSmallPhone
              ]}
            >
              {activeOnboardingStep.title}
            </Text>
          </View>
          <View style={styles.onboardingProgressTrack}>
            <View style={[styles.onboardingProgressFill, { width: `${onboardingProgressPercent}%` }]} />
          </View>
        </View>
      </View>
    );

    const onboardingBody = (
      <>
        {onboardingStatus ? <Text style={styles.status}>{onboardingStatus}</Text> : null}
        {onboardingError ? <Text style={styles.errorText}>{onboardingError}</Text> : null}
        {restaurantError && !onboardingError ? <Text style={styles.errorText}>{restaurantError}</Text> : null}

        {renderOnboardingStepContent()}
      </>
    );

    const onboardingFooter = (
      <View style={[styles.onboardingFooterBar, isSmallPhone && styles.onboardingFooterBarSmallPhone]}>
        <Pressable
          style={[
            styles.outlineButton,
            styles.onboardingFooterButton,
            isSmallPhone && styles.onboardingFooterButtonSmallPhone,
            onboardingStepIndex === 0 && styles.outlineButtonDisabled
          ]}
          onPress={handleOnboardingBack}
          disabled={onboardingStepIndex === 0 || restaurantLoading || digitalMenuLoading || digitalMenuSaving}
        >
          <Text
            style={[
              styles.outlineButtonText,
              isSmallPhone && styles.onboardingFooterButtonTextSmallPhone,
              onboardingStepIndex === 0 && styles.outlineButtonTextDisabled
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.82}
          >
            Zurück
          </Text>
        </Pressable>
        <Pressable
          style={[
            styles.button,
            styles.onboardingFooterButton,
            isSmallPhone && styles.onboardingFooterButtonSmallPhone
          ]}
          onPress={
            onboardingStepIndex === restaurantOnboardingSteps.length - 1
              ? handleCompleteRestaurantOnboarding
              : handleOnboardingNext
          }
          disabled={restaurantLoading || digitalMenuLoading || digitalMenuSaving}
        >
          <Text
            style={[styles.buttonText, isSmallPhone && styles.onboardingFooterButtonTextSmallPhone]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.78}
          >
            {restaurantLoading || digitalMenuLoading || digitalMenuSaving
              ? 'Bitte warten...'
              : onboardingStepIndex === restaurantOnboardingSteps.length - 1
              ? 'Einrichtung speichern'
              : 'Weiter'}
          </Text>
        </Pressable>
      </View>
    );

    if (!isSmallPhone) {
      return (
        <>
          {onboardingHeader}
          {onboardingBody}
          {onboardingFooter}
        </>
      );
    }

    return (
      <View style={styles.mobileViewportShell}>
        <View style={styles.mobileViewportHeader}>{onboardingHeader}</View>
        <ScrollView
          style={styles.mobileViewportBody}
          contentContainerStyle={[
            styles.mobileViewportBodyContent,
            styles.onboardingViewportBodyContent
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
        >
          {onboardingBody}
        </ScrollView>
        <View
          style={[
            styles.mobileViewportFooter,
            styles.onboardingViewportFooterSmallPhone,
            { paddingBottom: Math.max(insets.bottom, spacing.sm) }
          ]}
        >
          {onboardingFooter}
        </View>
      </View>
    );
  };

  const dashboardPanelItems = useMemo(() => {
    return dashboardPanels
      .filter((panel) => !panel.foodOnly || restaurantOffersFood)
      .filter((panel) => !panel.statisticsFeature || restaurantOffersFood || restaurantOffersEvents)
      .filter((panel) => !panel.eventFeature || eventsEnabled)
      .filter((panel) => !panel.servicesFeature || eventsEnabled || cateringEnabled)
      .map((panel) => {
        if (panel.key !== 'services') return panel;
        const cateringReady = cateringEnabled && Boolean(restaurant?.cateringSetupCompletedAt);
        return {
          ...panel,
          text: restaurantEventsReady || cateringReady ? panel.text : 'In Einstellungen aktivieren'
        };
      });
  }, [cateringEnabled, eventsEnabled, restaurant?.cateringSetupCompletedAt, restaurantEventsReady, restaurantOffersEvents, restaurantOffersFood]);
  const showDashboardChrome = restaurant && !isOnboardingMode && !activePanel;
  const useViewportShell = isSmallPhone && isOnboardingMode;
  const compactCardStyle = isSmallPhone ? styles.cardSmallPhone : null;
  const compactCardTitleStyle = isSmallPhone ? styles.cardTitleSmallPhone : null;
  const compactHelperTextStyle = isSmallPhone ? styles.helperTextSmallPhone : null;
  const compactSectionLabelStyle = isSmallPhone ? styles.sectionLabelSmallPhone : null;
  const compactInputStyle = isSmallPhone ? styles.inputSmallPhone : null;
  const compactTextAreaStyle = isSmallPhone ? styles.textAreaSmallPhone : null;
  const authInputProps = {
    placeholderTextColor: colors.muted,
    selectionColor: colors.accent,
    cursorColor: colors.accent
  };
  const isPasswordVisible = (key) => Boolean(visiblePasswordFields[key]);
  const togglePasswordVisibility = (key) => {
    setVisiblePasswordFields((current) => ({ ...current, [key]: !current[key] }));
  };
  const renderAuthPasswordField = ({ fieldKey, value, onChangeText, placeholder }) => {
    const visible = isPasswordVisible(fieldKey);
    return (
      <View
        style={[
          styles.passwordFieldWrap,
          styles.passwordAuthFieldWrap,
          isSmallPhone && styles.passwordAuthFieldWrapSmallPhone
        ]}
      >
        <TextInput
          {...authInputProps}
          placeholder={placeholder}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={!visible}
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.input, styles.authInput, compactInputStyle, styles.passwordInput]}
        />
        <Pressable
          style={styles.passwordVisibilityButton}
          onPress={() => togglePasswordVisibility(fieldKey)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={visible ? 'Passwort verbergen' : 'Passwort anzeigen'}
        >
          <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.muted} />
        </Pressable>
      </View>
    );
  };

  const renderPanelScreenHeader = (title) => (
    <View style={[styles.panelScreenHeader, isSmallPhone && styles.panelScreenHeaderSmallPhone]}>
      <Text style={[styles.panelScreenTitle, isSmallPhone && styles.panelScreenTitleSmallPhone]}>{title}</Text>
      <Pressable
        style={[styles.guideCloseButton, isCompactLayout && styles.guideCloseButtonCompact]}
        onPress={goToDashboard}
      >
        <Ionicons name="close" size={18} color={colors.muted} />
      </Pressable>
    </View>
  );

  const renderMenuWorkspaceHeader = () => {
    const isLunch = menuWorkspace === 'lunch';
    const isBreakfast = menuWorkspace === 'breakfast';
    const kind = menuKindForWorkspace(menuWorkspace);
    const menuState = getMenuDraftState(kind);
    const dirty = kind === 'lunch' ? lunchMenuDirty : digitalMenuDirty;
    const updatedAt = menuState.draft?.updatedAt;
    const title = isLunch ? 'Mittagstisch' : isBreakfast ? 'Frühstück' : menuWorkspace === 'files' ? 'PDF oder Bild' : 'Hauptkarte';
    const icon = isLunch ? 'sunny-outline' : isBreakfast ? 'cafe-outline' : menuWorkspace === 'files' ? 'images-outline' : 'book-outline';
    return (
      <View style={styles.menuWorkspaceHeaderShell}>
        <View style={styles.menuWorkspaceHeader}>
          <Pressable style={styles.menuWorkspaceBackButton} onPress={() => requestMenuWorkspace(null)}>
            <Ionicons name="chevron-back" size={22} color={colors.ink} />
          </Pressable>
          <View style={styles.menuWorkspaceHeaderText}>
            <Text style={styles.menuWorkspaceDate}>
              {new Date().toLocaleDateString('de-DE', {
                weekday: 'long',
                day: '2-digit',
                month: 'short',
                timeZone: restaurantTimeZone
              })}
            </Text>
            <Text style={styles.menuWorkspaceTitle}>{title}</Text>
          </View>
          <View style={[styles.menuWorkspaceHeaderIcon, isLunch && styles.menuWorkspaceHeaderIconLunch]}>
            <Ionicons name={icon} size={18} color={isLunch ? '#4E9D69' : '#6176A8'} />
          </View>
        </View>
        {menuWorkspace !== 'files' ? (
          <>
            <View style={[styles.menuSaveStatusBar, dirty ? styles.menuSaveStatusDirty : styles.menuSaveStatusSaved]}>
              <View style={styles.menuSaveStatusCopy}>
                <View style={[styles.menuSaveStatusDot, dirty && styles.menuSaveStatusDotDirty]} />
                <Text style={[styles.menuSaveStatusText, dirty && styles.menuSaveStatusTextDirty]} numberOfLines={1}>
                  {dirty
                    ? 'Noch nicht gespeichert'
                    : updatedAt
                    ? `Alles gespeichert · ${new Date(updatedAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr`
                    : 'Noch keine Karte gespeichert'}
                </Text>
              </View>
              <Pressable
                style={[styles.menuStickySaveButton, (!dirty || menuState.saving || menuUndo) && styles.menuStickySaveButtonDisabled]}
                onPress={() => handleSaveDigitalMenu(kind)}
                disabled={!dirty || menuState.saving || Boolean(menuUndo)}
              >
                <Text style={styles.menuStickySaveButtonText}>{menuState.saving ? 'Speichert...' : 'Speichern'}</Text>
              </Pressable>
            </View>
          </>
        ) : null}
        {menuUndo ? (
          <View style={styles.menuUndoBar}>
            <Text style={styles.menuUndoText}>{menuUndo.type === 'card' ? 'Karte wird gelöscht.' : 'Gericht entfernt.'}</Text>
            <Pressable onPress={restorePendingMenuUndo}><Text style={styles.menuUndoAction}>Rückgängig</Text></Pressable>
          </View>
        ) : null}
        {menuWorkspace !== 'files' && !isLunch && isBreakfast ? (
          <Text style={styles.menuBreakfastHint}>Zeigt Frühstücksgerichte aus deiner Hauptkarte.</Text>
        ) : null}
      </View>
    );
  };

  const renderMenuWorkspaceOverview = (workspace) => {
    const isLunch = workspace === 'lunch';
    const isBreakfast = workspace === 'breakfast';
    const kind = isLunch ? 'lunch' : 'normal';
    const allItems = isLunch ? lunchMenuDraft.items || [] : digitalMenuDraft.items || [];
    const itemCount = isBreakfast
      ? groupedBreakfastMenu.reduce((sum, group) => sum + group.items.length, 0)
      : allItems.length;
    const totalViews = menuAnalytics?.[kind]?.total || 0;
    const theme = isLunch
      ? { main: '#60AD7B', soft: '#EAF6ED', text: '#3E8056', icon: 'sunny-outline' }
      : { main: '#7082B4', soft: '#ECF1FB', text: '#4A6095', icon: 'scan-outline' };
    const hasItems = allItems.length > 0;
    return (
      <View style={styles.menuOverviewShell}>
        <View style={styles.menuOverviewGrid}>
          <Pressable
            style={[
              styles.menuOverviewScanTile,
              { backgroundColor: theme.main },
              menuPickerInProgress && styles.menuPickerDisabled
            ]}
            onPress={() => openMenuAddFlow(kind)}
            disabled={menuPickerInProgress}
          >
            <View style={styles.menuOverviewDecorCircle} />
            <Ionicons name={hasItems ? 'cloud-upload-outline' : 'add-circle-outline'} size={25} color={colors.white} />
            <View>
              <Text style={styles.menuOverviewScanTitle}>{hasItems ? 'Neue Karte hochladen' : 'Karte anlegen'}</Text>
              <Text style={styles.menuOverviewScanText}>{hasItems ? 'Ersetzen oder ergänzen' : 'Foto oder PDF mit KI erstellen'}</Text>
            </View>
          </Pressable>
          <View style={styles.menuOverviewSideColumn}>
            <Pressable
              style={styles.menuOverviewActionTile}
              onPress={() => openMenuCardContent(kind)}
            >
              <View style={styles.menuOverviewActionIconRow}>
                <Ionicons name={theme.icon} size={20} color={theme.text} />
                <Ionicons name="chevron-forward" size={18} color="#A8B3C8" />
              </View>
              <View style={styles.menuOverviewActionText}>
                <Text style={styles.menuOverviewActionTitle}>Karte öffnen</Text>
                <Text style={[styles.menuOverviewActionCaption, { color: theme.text }]}>{itemCount} {itemCount === 1 ? 'Gericht' : 'Gerichte'}</Text>
              </View>
            </Pressable>
            <Pressable
              style={styles.menuOverviewActionTile}
              onPress={() => openMenuItemEditor(null, kind)}
            >
              <View style={styles.menuOverviewActionIconRow}>
                <Ionicons name="create-outline" size={20} color={theme.text} />
                <Ionicons name="chevron-forward" size={18} color="#A8B3C8" />
              </View>
              <View style={styles.menuOverviewActionText}>
                <Text style={styles.menuOverviewActionTitle}>Gericht eintragen</Text>
                <Text style={styles.menuOverviewActionCaption}>Manuell, ohne KI</Text>
              </View>
            </Pressable>
          </View>
        </View>
        <View style={styles.menuOverviewBottomRow}>
          <View style={styles.menuOverviewMetricTile}>
            <Text style={styles.menuOverviewMetricLabel}>Gesamte Aufrufe</Text>
            <Text style={[styles.menuOverviewMetricValue, { color: theme.text }]}>{totalViews}</Text>
            <Text style={styles.menuOverviewMetricHint}>Seit Start der Statistik</Text>
          </View>
          <Pressable style={[styles.menuOverviewMetricTile, styles.menuOverviewAnalyticsActionTile]} onPress={() => openMenuAnalytics(kind)}>
            <View style={styles.menuOverviewAnalyticsActionTop}>
              <Ionicons name="calendar-outline" size={20} color={theme.text} />
              <Ionicons name="chevron-forward" size={18} color="#91A0BB" />
            </View>
            <Text style={[styles.menuOverviewAnalyticsActionTitle, { color: theme.text }]}>Letzte 7 Tage</Text>
            <Text style={styles.menuOverviewMetricHint}>Einzelne Aufrufe ansehen</Text>
          </Pressable>
        </View>
        {menuAnalyticsError ? <Text style={styles.menuOverviewError}>{menuAnalyticsError}</Text> : null}
      </View>
    );
  };

  const renderMenuSelector = () => (
    <View style={styles.menuSelectorShell}>
      <Text style={styles.menuSelectorTitle}>Mein Menü</Text>
      <Text style={styles.menuSelectorText}>Wähle aus, welchen Bereich du bearbeiten möchtest.</Text>
      <Pressable style={[styles.menuSelectorCard, styles.menuSelectorCardRegular]} onPress={() => requestMenuWorkspace('regular')}>
        <View style={styles.menuSelectorIcon}><Ionicons name="restaurant-outline" size={22} color="#6176A8" /></View>
        <View style={styles.menuSelectorCopy}><Text style={styles.menuSelectorCardTitle}>Speisekarte</Text><Text style={styles.menuSelectorCardText}>Ganze Karte mit einzelnen Gerichten</Text></View>
        <Ionicons name="chevron-forward" size={19} color="#6176A8" />
      </Pressable>
      <Pressable style={[styles.menuSelectorCard, styles.menuSelectorCardLunch]} onPress={() => requestMenuWorkspace('lunch')}>
        <View style={styles.menuSelectorIcon}><Ionicons name="sunny-outline" size={22} color="#4E9D69" /></View>
        <View style={styles.menuSelectorCopy}><Text style={styles.menuSelectorCardTitle}>Mittagstisch</Text><Text style={styles.menuSelectorCardText}>Gerichte je Wochentag und direkt als Angebot</Text></View>
        <Ionicons name="chevron-forward" size={19} color="#4E9D69" />
      </Pressable>
      <Pressable style={styles.menuSelectorFileCard} onPress={() => requestMenuWorkspace('files')}>
        <Ionicons name="images-outline" size={20} color="#71809A" />
        <View style={styles.menuSelectorCopy}><Text style={styles.menuSelectorCardTitle}>Menü als PDF oder Bild</Text><Text style={styles.menuSelectorCardText}>Ohne Umwandlung als Datei anzeigen</Text></View>
        <Ionicons name="chevron-forward" size={19} color="#A8B3C8" />
      </Pressable>
    </View>
  );

  const renderViewportPanel = (title, content) => {
    const header = renderPanelScreenHeader(title);
    return (
      <>
        {header}
        {content}
      </>
    );
  };

  const renderRestaurantReviewsPanel = () => (
    <View
      style={[
        styles.card,
        styles.panelScreenCard,
        compactCardStyle,
        isSmallPhone && styles.panelScreenCardSmallPhone
      ]}
    >
      <View style={styles.sectionCardTitleRow}>
        <Ionicons name="star-outline" size={18} color={colors.accentWarm} />
        <Text style={[styles.sectionCardTitle, isSmallPhone && styles.sectionCardTitleSmallPhone]}>
          Bewertungen
        </Text>
        {unreadReviewsCount > 0 ? (
          <View style={styles.pendingCountBadge}>
            <Text style={styles.pendingCountBadgeText}>{unreadReviewsCount}</Text>
          </View>
        ) : null}
      </View>
      <Text style={[styles.helperText, compactHelperTextStyle]}>
        Öffentliche Antworten erscheinen direkt unter der Bewertung im Nutzerprofil.
      </Text>
      <Pressable style={styles.outlineButton} onPress={() => loadRestaurantReviews()}>
        <Text style={styles.outlineButtonText}>Bewertungen aktualisieren</Text>
      </Pressable>
      {restaurantError ? <Text style={styles.errorText}>{restaurantError}</Text> : null}
      {status ? <Text style={styles.status}>{status}</Text> : null}
      <View style={styles.reviewAdminList}>
        {(restaurantReviews || []).map((review) => (
          <View
            key={review.id}
            style={[
              styles.reviewAdminCard,
              review.isUnread && styles.reviewAdminCardUnread,
              highlightedReviewId === review.id && styles.reviewAdminCardHighlighted
            ]}
          >
            <View style={styles.reviewAdminHeader}>
              <View style={styles.reviewAdminHeaderMain}>
                <View style={styles.reviewAdminStars}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Ionicons
                      key={`${review.id}-star-${star}`}
                      name={star <= Number(review.rating || 0) ? 'star' : 'star-outline'}
                      size={15}
                      color="#F59E0B"
                    />
                  ))}
                </View>
                <Text style={styles.reviewAdminAuthor}>{review.authorName || 'Gast'}</Text>
                <Text style={styles.reviewAdminDate}>{formatReviewDate(review.createdAt)}</Text>
              </View>
              {review.isUnread ? (
                <View style={styles.reviewUnreadBadge}>
                  <Text style={styles.reviewUnreadBadgeText}>Neu</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.reviewAdminText}>{review.text}</Text>
            {Array.isArray(review.images) && review.images.length ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.reviewAdminImageScroll}
                contentContainerStyle={styles.reviewAdminImageRow}
              >
                {review.images.map((image, index) => (
                  <Image
                    key={image.id || `${review.id}-image-${index}`}
                    source={{ uri: image.url }}
                    style={styles.reviewAdminImage}
                  />
                ))}
              </ScrollView>
            ) : null}
            {reviewReportingEnabled && getReviewModerationLabel(review) ? (
              <View
                style={[
                  styles.reviewModerationBadge,
                  review.visibilityStatus === 'removed' && styles.reviewModerationBadgeRemoved
                ]}
              >
                <Ionicons
                  name={review.visibilityStatus === 'removed' ? 'eye-off-outline' : 'shield-checkmark-outline'}
                  size={15}
                  color={review.visibilityStatus === 'removed' ? '#C2410C' : colors.accentCool}
                />
                <Text
                  style={[
                    styles.reviewModerationBadgeText,
                    review.visibilityStatus === 'removed' && styles.reviewModerationBadgeTextRemoved
                  ]}
                >
                  {getReviewModerationLabel(review)}
                </Text>
              </View>
            ) : null}
            {reviewReportingEnabled && review.report?.resolutionNote ? (
              <Text style={styles.reviewModerationNote}>{review.report.resolutionNote}</Text>
            ) : null}
            {review.visibilityStatus !== 'removed' ? (
              <>
                {review.replyText ? (
                  <View style={styles.reviewAdminReplyBox}>
                    <Text style={styles.reviewAdminReplyLabel}>Aktuelle öffentliche Antwort</Text>
                    <Text style={styles.reviewAdminReplyText}>{review.replyText}</Text>
                  </View>
                ) : null}
                <TextInput
                  value={reviewReplyDrafts[review.id] ?? ''}
                  onChangeText={(value) =>
                    setReviewReplyDrafts((prev) => ({
                      ...prev,
                      [review.id]: value
                    }))
                  }
                  placeholder="Öffentlich antworten..."
                  multiline
                  textAlignVertical="top"
                  style={[styles.input, compactInputStyle, styles.reviewReplyInput]}
                />
                <View style={styles.reviewAdminActions}>
                  <Pressable
                    style={[styles.offerEditButton, restaurantLoading && styles.offerDeleteButtonDisabled]}
                    onPress={() => handleSaveReviewReply(review)}
                    disabled={restaurantLoading}
                  >
                    <Ionicons name="chatbubble-outline" size={15} color={colors.white} />
                    <Text style={styles.offerEditButtonText}>Antwort speichern</Text>
                  </Pressable>
                  {review.isUnread ? (
                    <Pressable
                      style={styles.outlineButton}
                      onPress={() => handleMarkReviewRead(review.id)}
                    >
                      <Text style={styles.outlineButtonText}>Als gelesen markieren</Text>
                    </Pressable>
                  ) : null}
                </View>
              </>
            ) : null}
            {reviewReportingEnabled && !review.report && review.visibilityStatus !== 'removed' ? (
              <Pressable style={styles.reviewReportLink} onPress={() => openReviewReport(review)}>
                <Ionicons name="flag-outline" size={15} color="#C2410C" />
                <Text style={styles.reviewReportLinkText}>Bewertung melden</Text>
              </Pressable>
            ) : null}
            {review.visibilityStatus === 'removed' && review.isUnread ? (
                <Pressable
                  style={styles.outlineButton}
                  onPress={() => handleMarkReviewRead(review.id)}
                >
                  <Text style={styles.outlineButtonText}>Als gelesen markieren</Text>
                </Pressable>
            ) : null}
          </View>
        ))}
      </View>
      {!(restaurantReviews || []).length ? (
        <Text style={[styles.helperText, compactHelperTextStyle]}>Noch keine Bewertungen.</Text>
      ) : null}
    </View>
  );

  const renderRestaurantOrdersPanel = () => (
    <View
      style={[
        styles.card,
        styles.panelScreenCard,
        styles.ordersCard,
        compactCardStyle,
        isSmallPhone && styles.panelScreenCardSmallPhone
      ]}
    >
      <View style={styles.sectionCardTitleRow}>
        <Ionicons name="receipt-outline" size={18} color={colors.accentCool} />
        <Text style={[styles.sectionCardTitle, isSmallPhone && styles.sectionCardTitleSmallPhone]}>
          Bestellungen
        </Text>
        {pendingOrdersCount > 0 ? (
          <View style={styles.pendingCountBadge}>
            <Text style={styles.pendingCountBadgeText}>{pendingOrdersCount}</Text>
          </View>
        ) : null}
      </View>
      {restaurantOrders.map((order) => (
        <View key={order.id} style={styles.orderRow}>
          <View style={styles.offerInfo}>
            <Text style={styles.offerTitle}>{order.offerTitle}</Text>
            <Text style={styles.offerMeta}>
              {order.customerName} - {order.quantity}x -{' '}
              {order.fulfillmentType === 'pickup' ? 'Abholen' : 'Vor Ort'}
            </Text>
            <Text style={styles.offerMeta}>
              {new Date(order.pickupTime).toLocaleTimeString('de-DE', {
                hour: '2-digit',
                minute: '2-digit'
              })}{' '}
              Uhr
            </Text>
          </View>
          <View style={[styles.orderActions, isSmallPhone && styles.orderActionsSmallPhone]}>
            <View
              style={[
                styles.statusPill,
                order.status === 'confirmed'
                  ? styles.statusOn
                  : order.status === 'cancelled'
                  ? styles.preorderOff
                  : styles.statusOff
              ]}
            >
              <Text style={styles.statusPillText}>
                {order.status === 'confirmed'
                  ? 'Bestätigt'
                  : order.status === 'cancelled'
                  ? 'Abgelehnt'
                  : 'Offen'}
              </Text>
            </View>
            {order.status === 'pending' ? (
              <>
                <Pressable
                  style={styles.editButton}
                  onPress={() => updateRestaurantOrder(order.id, 'confirmed')}
                >
                  <Ionicons name="checkmark" size={16} color={colors.white} />
                </Pressable>
                <Pressable
                  style={styles.editButtonCancel}
                  onPress={() => updateRestaurantOrder(order.id, 'cancelled')}
                >
                  <Ionicons name="close" size={16} color={colors.white} />
                </Pressable>
              </>
            ) : null}
            {order.status !== 'pending' ? (
              <Pressable
                style={[
                  styles.editButtonCancel,
                  restaurantLoading && styles.offerDeleteButtonDisabled
                ]}
                onPress={() => handleDeleteOrder(order)}
                disabled={restaurantLoading}
              >
                <Ionicons name="trash-outline" size={16} color={colors.white} />
              </Pressable>
            ) : null}
          </View>
        </View>
      ))}
      {!restaurantOrders.length ? (
        <Text style={[styles.helperText, compactHelperTextStyle]}>Noch keine Bestellungen.</Text>
      ) : null}
    </View>
  );

  const renderRestaurantReservationsPanel = () => (
    <View
      style={[
        styles.card,
        styles.panelScreenCard,
        styles.reservationsCard,
        compactCardStyle,
        isSmallPhone && styles.panelScreenCardSmallPhone
      ]}
    >
      <View style={styles.sectionCardTitleRow}>
        <Ionicons name="calendar-outline" size={18} color={colors.accentWarm} />
        <Text style={[styles.sectionCardTitle, isSmallPhone && styles.sectionCardTitleSmallPhone]}>
          Tischreservierungen
        </Text>
        {pendingReservationsCount > 0 ? (
          <View style={styles.pendingCountBadge}>
            <Text style={styles.pendingCountBadgeText}>{pendingReservationsCount}</Text>
          </View>
        ) : null}
      </View>
      {restaurantReservations.map((reservation) => (
        <View key={reservation.id} style={styles.orderRow}>
          <View style={styles.offerInfo}>
            <Text style={styles.offerTitle}>{reservation.customerName}</Text>
            <Text style={styles.offerMeta}>
              {reservation.partySize} Personen -{' '}
              {mealSlotLabelByKey[reservation.mealSlot] || reservation.mealSlot}
            </Text>
            <Text style={styles.offerMeta}>
              {new Date(reservation.reservationTime).toLocaleString('de-DE', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </Text>
            {reservation.note ? (
              <Text style={styles.offerDescription} numberOfLines={2}>
                {reservation.note}
              </Text>
            ) : null}
          </View>
          <View style={[styles.orderActions, isSmallPhone && styles.orderActionsSmallPhone]}>
            <View
              style={[
                styles.statusPill,
                reservation.status === 'confirmed'
                  ? styles.statusOn
                  : reservation.status === 'cancelled'
                  ? styles.preorderOff
                  : styles.statusOff
              ]}
            >
              <Text style={styles.statusPillText}>
                {reservation.status === 'confirmed'
                  ? 'Bestätigt'
                  : reservation.status === 'cancelled'
                  ? 'Abgelehnt'
                  : 'Offen'}
              </Text>
            </View>
            {reservation.status === 'pending' ? (
              <>
                <Pressable
                  style={styles.editButton}
                  onPress={() => updateRestaurantReservation(reservation.id, 'confirmed')}
                >
                  <Ionicons name="checkmark" size={16} color={colors.white} />
                </Pressable>
                <Pressable
                  style={styles.editButtonCancel}
                  onPress={() => updateRestaurantReservation(reservation.id, 'cancelled')}
                >
                  <Ionicons name="close" size={16} color={colors.white} />
                </Pressable>
              </>
            ) : null}
          </View>
        </View>
      ))}
      {!restaurantReservations.length ? (
        <Text style={[styles.helperText, compactHelperTextStyle]}>Noch keine Reservierungen.</Text>
      ) : null}
    </View>
  );

  const analyticsMetricOptions = [
    { key: 'regular', title: 'Speisekarte', icon: 'book-outline', color: '#6176A8' },
    { key: 'lunch', title: 'Mittagstisch', icon: 'sunny-outline', color: '#4E9D69' },
    { key: 'offers', title: 'Angebote', icon: 'pricetag-outline', color: '#E77621' },
    { key: 'dishes', title: 'Gerichte', icon: 'restaurant-outline', color: '#7A5DB8' },
    { key: 'events', title: 'Events', icon: 'calendar-outline', color: '#7258D8' }
  ];

  const renderRestaurantStatisticsPanel = () => (
    <View style={[styles.card, styles.panelScreenCard, compactCardStyle, isSmallPhone && styles.panelScreenCardSmallPhone]}>
      <Text style={[styles.sectionCardTitle, isSmallPhone && styles.sectionCardTitleSmallPhone]}>Deine Statistik</Text>
      <Text style={[styles.helperText, compactHelperTextStyle]}>
        Aufrufe werden pro Gerät und Tag nur einmal gezählt.
      </Text>
      <View style={styles.statisticsMetricGrid}>
        {analyticsMetricOptions.map((metric) => {
          const value = menuAnalytics?.[metric.key]?.total || 0;
          return (
            <Pressable
              key={metric.key}
              style={({ pressed }) => [styles.statisticsMetricCard, pressed && styles.statisticsMetricCardPressed]}
              onPress={() => openMenuAnalytics(metric.key)}
            >
              <View style={styles.statisticsMetricHead}>
                <Ionicons name={metric.icon} size={19} color={metric.color} />
                <Ionicons name="chevron-forward" size={17} color={colors.muted} />
              </View>
              <Text style={styles.statisticsMetricLabel}>{metric.title}</Text>
              <Text style={[styles.statisticsMetricValue, { color: metric.color }]}>{value}</Text>
              <Text style={styles.statisticsMetricHint}>Letzte 7 Tage ansehen</Text>
            </Pressable>
          );
        })}
      </View>
      {menuAnalyticsError ? <Text style={styles.menuOverviewError}>{menuAnalyticsError}</Text> : null}
    </View>
  );

  const renderRestaurantRequestsPanel = () => (
    <View style={styles.requestsPanel}>
      <View style={styles.requestsTabRow}>
        <Pressable
          style={[styles.requestsTab, requestsTab === 'orders' && styles.requestsTabActive]}
          onPress={() => {
            setRequestsTab('orders');
            void loadRestaurantOrders();
          }}
        >
          <Text style={[styles.requestsTabText, requestsTab === 'orders' && styles.requestsTabTextActive]}>
            Bestellungen{pendingOrdersCount ? ` (${pendingOrdersCount})` : ''}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.requestsTab, requestsTab === 'reservations' && styles.requestsTabActive]}
          onPress={() => {
            setRequestsTab('reservations');
            void loadRestaurantReservations();
          }}
        >
          <Text style={[styles.requestsTabText, requestsTab === 'reservations' && styles.requestsTabTextActive]}>
            Tische{pendingReservationsCount ? ` (${pendingReservationsCount})` : ''}
          </Text>
        </Pressable>
      </View>
      {requestsTab === 'orders' ? renderRestaurantOrdersPanel() : renderRestaurantReservationsPanel()}
    </View>
  );

  const renderRestaurantCateringPanel = () => {
    const cateringConfigured =
      cateringEnabled &&
      restaurantProviderScopes.includes('catering') &&
      Boolean(restaurant?.cateringSetupCompletedAt);
    const rows = Array.isArray(restaurantCateringOffers) ? restaurantCateringOffers : [];
    if (!cateringConfigured) {
      return (
        <View style={[styles.card, styles.panelScreenCard, compactCardStyle]}>
          <View style={styles.sectionCardTitleRow}>
            <Ionicons name="briefcase-outline" size={20} color={colors.accentCool} />
            <Text style={[styles.sectionCardTitle, compactCardTitleStyle]}>Catering einrichten</Text>
          </View>
          <Text style={[styles.helperText, compactHelperTextStyle]}>
            Aktiviere Catering und hinterlege dein Angebot sowie mindestens eine Kontaktmöglichkeit. Danach kannst du hier eigene Catering-Angebote veröffentlichen.
          </Text>
          <Pressable style={[styles.button, styles.cateringProfileButton]} onPress={() => openDashboardSettings('catering')}>
            <Text style={styles.buttonText}>Catering-Profil einrichten</Text>
          </Pressable>
        </View>
      );
    }

    return (
      <View style={[styles.card, styles.panelScreenCard, compactCardStyle]}>
        <View style={styles.cateringDashboardHeading}>
          <View style={styles.cateringDashboardHeadingCopy}>
            <Text style={[styles.sectionCardTitle, compactCardTitleStyle]}>Meine Catering-Angebote</Text>
            <Text style={[styles.helperText, compactHelperTextStyle]} numberOfLines={2}>
              {restaurant?.cateringProfile?.offeringsText || 'Beschreibe dein Catering-Profil und veröffentliche passende Pakete.'}
            </Text>
          </View>
          <Pressable style={styles.cateringProfileEditIcon} onPress={() => openDashboardSettings('catering')}>
            <Ionicons name="create-outline" size={18} color={colors.accent} />
          </Pressable>
        </View>
        <Pressable style={styles.cateringProfileLinkButton} onPress={() => openDashboardSettings('catering')}>
          <Ionicons name="settings-outline" size={16} color={colors.accent} />
          <Text style={styles.cateringProfileLinkText}>Catering-Profil bearbeiten</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.accent} />
        </Pressable>

        {cateringOfferFormOpen ? (
          <View style={styles.cateringOfferEditor}>
            <Text style={styles.cateringOfferEditorTitle}>
              {editingCateringOffer ? 'Catering-Angebot bearbeiten' : 'Catering-Angebot erstellen'}
            </Text>
            <TextInput
              value={cateringOfferTitle}
              onChangeText={(value) => {
                setCateringOfferTitle(value);
                setCateringOfferStatus('');
              }}
              placeholder="Titel, z. B. Buffet für Firmenfeiern"
              maxLength={120}
              style={[styles.input, compactInputStyle]}
            />
            <TextInput
              value={cateringOfferDescription}
              onChangeText={(value) => {
                setCateringOfferDescription(value);
                setCateringOfferStatus('');
              }}
              placeholder="Was ist in diesem Catering-Angebot enthalten?"
              multiline
              textAlignVertical="top"
              maxLength={2000}
              style={[styles.input, styles.textArea, compactTextAreaStyle]}
            />
            <TextInput
              value={cateringOfferPrice}
              onChangeText={(value) => {
                setCateringOfferPrice(value);
                setCateringOfferStatus('');
              }}
              placeholder="Preis optional, z. B. 12,50 €"
              keyboardType="decimal-pad"
              style={[styles.input, compactInputStyle]}
            />
            <View style={styles.cateringOfferImageHeader}>
              <Text style={styles.cateringOfferImageLabel}>Bilder ({cateringOfferImages.length}/4)</Text>
              <Pressable
                style={[styles.cateringOfferImageButton, cateringOfferImages.length >= 4 && styles.cateringOfferImageButtonDisabled]}
                onPress={handlePickCateringOfferImages}
                disabled={cateringOfferImages.length >= 4 || restaurantLoading}
              >
                <Ionicons name="images-outline" size={16} color={colors.accent} />
                <Text style={styles.cateringOfferImageButtonText}>Bilder hinzufügen</Text>
              </Pressable>
            </View>
            {cateringOfferImages.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cateringOfferImageRow}>
                {cateringOfferImages.map((imageUrl, index) => (
                  <View key={`${imageUrl}-${index}`} style={styles.cateringOfferImagePreviewWrap}>
                    <Image source={{ uri: imageUrl }} style={styles.cateringOfferImagePreview} />
                    <Pressable
                      style={styles.cateringOfferImageRemove}
                      onPress={() => setCateringOfferImages((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                      accessibilityLabel={`Bild ${index + 1} entfernen`}
                    >
                      <Ionicons name="close" size={14} color={colors.white} />
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            ) : null}
            {cateringOfferStatus ? <Text style={styles.cateringOfferFeedback}>{cateringOfferStatus}</Text> : null}
            <View style={styles.cateringOfferEditorActions}>
              <Pressable style={[styles.button, styles.cateringOfferEditorSave]} onPress={handleSaveCateringOffer} disabled={restaurantLoading}>
                <Text style={styles.buttonText}>{restaurantLoading ? 'Bitte warten...' : 'Speichern'}</Text>
              </Pressable>
              <Pressable style={[styles.outlineButton, styles.cateringOfferEditorCancel]} onPress={resetCateringOfferForm}>
                <Text style={styles.outlineButtonText}>Abbrechen</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable style={[styles.button, styles.cateringOfferCreateButton]} onPress={() => openCateringOfferEditor()}>
            <Ionicons name="add" size={19} color={colors.white} />
            <Text style={styles.buttonText}>Catering-Angebot erstellen</Text>
          </Pressable>
        )}

        <View style={styles.cateringOfferList}>
          {rows.map((offer) => (
            <View key={offer.id} style={[styles.cateringOfferRow, offer.active === false && styles.cateringOfferRowOffline]}>
              <View style={styles.cateringOfferRowCopy}>
                <View style={styles.cateringOfferRowTitleLine}>
                  <Text style={styles.offerTitle}>{offer.title}</Text>
                  {offer.price != null ? <Text style={styles.cateringOfferRowPrice}>{formatPrice(offer.price)}</Text> : null}
                </View>
                <Text style={styles.offerDescription} numberOfLines={3}>{offer.description}</Text>
                {offer.imageUrls?.length ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cateringOfferListImageRow}>
                    {offer.imageUrls.map((imageUrl, index) => (
                      <Image key={`${offer.id}-image-${index}`} source={{ uri: imageUrl }} style={styles.cateringOfferListImage} />
                    ))}
                  </ScrollView>
                ) : null}
              </View>
              <View style={styles.cateringOfferRowActions}>
                <ToggleSwitch
                  compact
                  label={offer.active === false ? 'Offline' : 'Online'}
                  value={offer.active !== false}
                  onPress={() => void handleToggleCateringOffer(offer)}
                />
                <Pressable style={styles.offerEditButton} onPress={() => openCateringOfferEditor(offer)}>
                  <Ionicons name="create-outline" size={15} color={colors.white} />
                  <Text style={styles.offerEditButtonText}>Bearbeiten</Text>
                </Pressable>
                <Pressable style={styles.offerDeleteButton} onPress={() => handleDeleteCateringOffer(offer)}>
                  <Ionicons name="trash-outline" size={15} color={colors.white} />
                </Pressable>
              </View>
            </View>
          ))}
          {!rows.length ? <Text style={[styles.helperText, compactHelperTextStyle]}>Noch keine Catering-Angebote erstellt.</Text> : null}
        </View>
      </View>
    );
  };

  const renderRestaurantServicesPanel = () => {
    const selectedTab = servicesDashboardTab === 'catering' && cateringEnabled ? 'catering' : 'events';
    return (
      <View style={styles.servicesDashboardPanel}>
        <View style={styles.servicesDashboardTabs}>
          {eventsEnabled ? (
            <Pressable
              style={[styles.servicesDashboardTab, selectedTab === 'events' && styles.servicesDashboardTabActive]}
              onPress={() => {
                Keyboard.dismiss();
                setServicesDashboardTab('events');
              }}
            >
              <Ionicons name="calendar-outline" size={17} color={selectedTab === 'events' ? colors.white : colors.ink} />
              <Text style={[styles.servicesDashboardTabText, selectedTab === 'events' && styles.servicesDashboardTabTextActive]}>Events</Text>
            </Pressable>
          ) : null}
          {cateringEnabled ? (
            <Pressable
              style={[styles.servicesDashboardTab, selectedTab === 'catering' && styles.servicesDashboardTabActive]}
              onPress={() => {
                Keyboard.dismiss();
                setServicesDashboardTab('catering');
                void loadRestaurantCateringOffers();
              }}
            >
              <Ionicons name="briefcase-outline" size={17} color={selectedTab === 'catering' ? colors.white : colors.ink} />
              <Text style={[styles.servicesDashboardTabText, selectedTab === 'catering' && styles.servicesDashboardTabTextActive]}>Catering</Text>
            </Pressable>
          ) : null}
        </View>
        {selectedTab === 'catering' ? renderRestaurantCateringPanel() : renderRestaurantEventsPanel()}
      </View>
    );
  };

  const renderRestaurantEventsPanel = () => {
    const previewTags = Array.isArray(eventForm.tags) && eventForm.tags.length ? eventForm.tags : ['other'];
    const previewEvent = {
      id: eventForm.id || 'preview',
      title: eventForm.title || 'Event-Titel',
      description: eventForm.description || 'Beschreibung des Events',
      tags: previewTags,
      primaryTag: eventForm.primaryTag || previewTags[0],
      venueName: eventForm.venueName || restaurant?.name || 'Ort',
      address: eventForm.address || restaurant?.address || '',
      postalCode: eventForm.postalCode || restaurant?.postalCode || '',
      startAt: eventInputTextToIso(eventForm.startAtText) || new Date().toISOString(),
      endAt: eventInputTextToIso(eventForm.endAtText) || new Date().toISOString(),
      recurrenceType: eventForm.recurrenceType === 'weekly' || eventForm.recurrenceType === 'monthly'
        ? eventForm.recurrenceType
        : 'none',
      recurrenceWeekdays: normalizeEventWeekdaysForEdit(eventForm.recurrenceWeekdays),
      recurrenceEndAt:
        eventForm.recurrenceType !== 'none' && eventForm.recurrenceEndMode === 'until'
          ? eventInputTextToEndOfDayIso(eventForm.recurrenceEndAtText)
          : null,
      socialLinks: Array.isArray(eventForm.socialLinks) ? eventForm.socialLinks : [],
      imageUrl: eventForm.imageUrl || '',
      provider: { name: restaurant?.name || 'Anbieter' }
    };
    const eventRows = Array.isArray(restaurantEvents) ? restaurantEvents : [];
    const renderEventDateTimeField = (field, label) => (
      <View style={styles.eventDatePickerGroup}>
        <Text style={styles.eventDatePickerLabel}>{label}</Text>
        <View style={styles.eventDatePickerRow}>
          <Pressable
            style={styles.eventDatePickerButton}
            onPress={() => openEventDateTimePicker(field, 'date')}
          >
            <Ionicons name="calendar-outline" size={17} color={colors.accent} />
            <Text style={styles.eventDatePickerButtonText}>{formatEventDatePickerLabel(eventForm[field])}</Text>
          </Pressable>
          <Pressable
            style={styles.eventDatePickerButton}
            onPress={() => openEventDateTimePicker(field, 'time')}
          >
            <Ionicons name="time-outline" size={17} color={colors.accent} />
            <Text style={styles.eventDatePickerButtonText}>{formatEventTimePickerLabel(eventForm[field])}</Text>
          </Pressable>
        </View>
      </View>
    );
    const renderAdditionalEventDateTimeField = (index, field, label) => {
      const value = eventForm.scheduledOccurrences?.[index]?.[field] || '';
      return (
        <View style={styles.eventDatePickerGroup}>
          <Text style={styles.eventDatePickerLabel}>{label}</Text>
          <View style={styles.eventDatePickerRow}>
            <Pressable
              style={styles.eventDatePickerButton}
              onPress={() => openAdditionalEventDateTimePicker(index, field, 'date')}
            >
              <Ionicons name="calendar-outline" size={17} color={colors.accent} />
              <Text style={styles.eventDatePickerButtonText}>{formatEventDatePickerLabel(value)}</Text>
            </Pressable>
            <Pressable
              style={styles.eventDatePickerButton}
              onPress={() => openAdditionalEventDateTimePicker(index, field, 'time')}
            >
              <Ionicons name="time-outline" size={17} color={colors.accent} />
              <Text style={styles.eventDatePickerButtonText}>{formatEventTimePickerLabel(value)}</Text>
            </Pressable>
          </View>
        </View>
      );
    };

    return (
      <View style={[styles.card, styles.panelScreenCard, compactCardStyle]}>
        <Text style={[styles.cardTitle, compactCardTitleStyle]}>Events</Text>
        <Text style={[styles.helperText, compactHelperTextStyle]}>
          Deine bestehenden Events stehen zuerst. Neue Events öffnest du nur bei Bedarf über „Event erstellen“.
        </Text>
        {!eventFormOpen && eventStatus ? <Text style={styles.status}>{eventStatus}</Text> : null}
        {!eventFormOpen && eventError ? <Text style={styles.errorText}>{eventError}</Text> : null}
        {!eventFormOpen && restaurantError ? <Text style={styles.errorText}>{restaurantError}</Text> : null}

        <View style={styles.eventAdminList}>
          <View style={styles.eventAdminHeaderRow}>
            <Text style={styles.settingsSectionLabel}>Meine Events</Text>
            <Pressable style={styles.eventRefreshButton} onPress={() => loadRestaurantEvents()}>
              <Ionicons name="refresh-outline" size={15} color={colors.accent} />
              <Text style={styles.eventRefreshButtonText}>Aktualisieren</Text>
            </Pressable>
          </View>
          {eventRows.map((event) => {
            const visibility = getRestaurantEventVisibilityStatus(event);
            return (
              <View key={event.id} style={styles.eventAdminCard}>
                <EventCard event={event} favorite={false} compact />
                <View
                  style={[
                    styles.eventVisibilityPill,
                    visibility.visible ? styles.eventVisibilityPillVisible : styles.eventVisibilityPillHidden
                  ]}
                >
                  <Ionicons
                    name={visibility.visible ? 'eye-outline' : 'alert-circle-outline'}
                    size={14}
                    color={visibility.visible ? colors.accentCool : colors.accentWarm}
                  />
                  <Text
                    style={[
                      styles.eventVisibilityText,
                      visibility.visible ? styles.eventVisibilityTextVisible : styles.eventVisibilityTextHidden
                    ]}
                  >
                    {visibility.text}
                  </Text>
                </View>
                {event.recurrenceType === 'weekly' || event.recurrenceType === 'monthly' ? (
                  <View style={styles.eventOccurrenceManager}>
                    <Pressable
                      style={styles.eventOccurrenceToggle}
                      onPress={() => toggleEventOccurrenceManager(event.id)}
                    >
                      <View style={styles.eventOccurrenceToggleTextWrap}>
                        <Text style={styles.eventOccurrenceToggleTitle}>Termine verwalten</Text>
                        <Text style={styles.eventOccurrenceToggleHint}>Einzelnen Termin absagen oder reaktivieren</Text>
                      </View>
                      <Ionicons
                        name={eventOccurrenceOpenIds.includes(event.id) ? 'chevron-up' : 'chevron-down'}
                        size={18}
                        color={colors.ink}
                      />
                    </Pressable>
                    {eventOccurrenceOpenIds.includes(event.id) ? (
                      <View style={styles.eventOccurrenceList}>
                        {(Array.isArray(event.upcomingOccurrences) ? event.upcomingOccurrences : []).map(
                          (occurrence) => {
                            const draftKey = `${event.id}:${occurrence.occurrenceStartAt}`;
                            return (
                              <View key={draftKey} style={styles.eventOccurrenceRow}>
                                <View style={styles.eventOccurrenceDateRow}>
                                  <Ionicons
                                    name={occurrence.occurrenceCancelled ? 'close-circle-outline' : 'calendar-outline'}
                                    size={17}
                                    color={occurrence.occurrenceCancelled ? colors.accentWarm : colors.accentCool}
                                  />
                                  <Text style={styles.eventOccurrenceDateText}>
                                    {formatEventOccurrenceAdminDate(occurrence.occurrenceStartAt)}
                                  </Text>
                                </View>
                                {occurrence.occurrenceCancelled ? (
                                  <>
                                    <Text style={styles.eventOccurrenceCancelledText}>
                                      Abgesagt{occurrence.cancellationReason ? `: ${occurrence.cancellationReason}` : ''}
                                    </Text>
                                    <Pressable
                                      style={styles.eventOccurrenceRestoreButton}
                                      onPress={() =>
                                        handleRestoreEventOccurrence(event.id, occurrence.cancellationId)
                                      }
                                      disabled={restaurantLoading}
                                    >
                                      <Text style={styles.eventOccurrenceRestoreText}>Absage aufheben</Text>
                                    </Pressable>
                                  </>
                                ) : (
                                  <>
                                    <TextInput
                                      value={eventCancellationReasonDrafts[draftKey] || ''}
                                      onChangeText={(value) =>
                                        setEventCancellationReasonDrafts((prev) => ({
                                          ...prev,
                                          [draftKey]: value
                                        }))
                                      }
                                      placeholder="Grund optional, z. B. Feiertag"
                                      style={[styles.input, compactInputStyle, styles.eventCancellationReasonInput]}
                                    />
                                    <Pressable
                                      style={styles.eventOccurrenceCancelButton}
                                      onPress={() =>
                                        handleCancelEventOccurrence(event.id, occurrence.occurrenceStartAt)
                                      }
                                      disabled={restaurantLoading}
                                    >
                                      <Text style={styles.eventOccurrenceCancelText}>Diesen Termin absagen</Text>
                                    </Pressable>
                                  </>
                                )}
                              </View>
                            );
                          }
                        )}
                        {!event.upcomingOccurrences?.length ? (
                          <Text style={[styles.helperText, compactHelperTextStyle]}>
                            Keine kommenden Termine gefunden.
                          </Text>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                ) : null}
                <View style={styles.eventAdminActions}>
                  <Pressable style={styles.offerEditButton} onPress={() => editRestaurantEvent(event)}>
                    <Ionicons name="create-outline" size={15} color={colors.white} />
                    <Text style={styles.offerEditButtonText}>Bearbeiten</Text>
                  </Pressable>
                  <Pressable style={styles.offerDeleteButton} onPress={() => handleDeleteRestaurantEvent(event.id)}>
                    <Ionicons name="trash-outline" size={15} color={colors.white} />
                    <Text style={styles.offerEditButtonText}>Löschen</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
          {!eventRows.length ? (
            <Text style={[styles.helperText, compactHelperTextStyle]}>Noch keine Events erstellt.</Text>
          ) : null}
          <Text style={[styles.helperText, compactHelperTextStyle]}>
            Wenn ein Event beim User fehlt: Datum/Ende, Aktiv-Status, Freischaltung, PLZ/Adresse sowie User-Filter prüfen.
          </Text>
          <Pressable
            style={[styles.button, styles.eventCreateButton, isSmallPhone && styles.buttonCompactSmallPhone]}
            onPress={openCreateRestaurantEvent}
          >
            <Ionicons name="add-circle-outline" size={18} color={colors.white} />
            <Text style={styles.buttonText}>Event erstellen</Text>
          </Pressable>
        </View>

        {eventFormOpen ? (
          <View style={styles.eventFormPanel} onLayout={handleEventFormLayout}>
            <Text style={styles.settingsSectionLabel}>{eventForm.id ? 'Event bearbeiten' : 'Neues Event'}</Text>
            <TextInput
              value={eventForm.title}
              onChangeText={(value) => updateEventForm('title', value)}
              placeholder="Titel des Events"
              style={[styles.input, compactInputStyle]}
            />
            <TextInput
              value={eventForm.description}
              onChangeText={(value) => updateEventForm('description', value)}
              placeholder="Was passiert beim Event?"
              multiline
              textAlignVertical="top"
              style={[styles.input, compactInputStyle, styles.textArea, compactTextAreaStyle]}
            />
            <TextInput
              value={eventForm.venueName}
              onChangeText={(value) => updateEventForm('venueName', value)}
              placeholder="Ort / Location"
              style={[styles.input, compactInputStyle]}
            />
            <TextInput
              value={eventForm.address}
              onChangeText={(value) => updateEventForm('address', value)}
              placeholder="Adresse"
              style={[styles.input, compactInputStyle]}
            />
            <TextInput
              value={eventForm.postalCode}
              onChangeText={(value) => updateEventForm('postalCode', value)}
              placeholder="Postleitzahl"
              keyboardType="number-pad"
              style={[styles.input, compactInputStyle]}
            />
            <View style={styles.eventDatePickerGrid}>
              {renderEventDateTimeField('startAtText', 'Start')}
              {renderEventDateTimeField('endAtText', 'Ende')}
            </View>
            {eventForm.recurrenceType === 'none' ? (
              <View style={styles.eventAdditionalDatesBox}>
                <Pressable style={styles.eventAddOccurrenceButton} onPress={addEventScheduledOccurrence}>
                  <Ionicons name="add-circle-outline" size={18} color={colors.accent} />
                  <Text style={styles.eventAddOccurrenceText}>Termin hinzufügen</Text>
                </Pressable>
                {eventForm.scheduledOccurrences?.map((occurrence, index) => (
                  <View key={`event-additional-occurrence-${index}`} style={styles.eventAdditionalOccurrenceCard}>
                    <View style={styles.eventAdditionalOccurrenceHeader}>
                      <Text style={styles.eventAdditionalDatesTitle}>Termin {index + 2}</Text>
                      <Pressable
                        style={styles.eventAdditionalDateRemoveButton}
                        onPress={() => removeEventScheduledOccurrence(index)}
                        accessibilityLabel={`Termin ${index + 2} entfernen`}
                      >
                        <Ionicons name="trash-outline" size={17} color={colors.accentWarm} />
                      </Pressable>
                    </View>
                    <View style={styles.eventDatePickerGrid}>
                      {renderAdditionalEventDateTimeField(index, 'startAtText', 'Start')}
                      {renderAdditionalEventDateTimeField(index, 'endAtText', 'Ende')}
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
            <View style={styles.eventRecurrenceBox}>
              <Text style={styles.eventDatePickerLabel}>Termine</Text>
              <View style={styles.eventRecurrenceModeRow}>
                {[
                  { key: 'none', label: 'Einzelne Termine' },
                  { key: 'weekly', label: 'Jede Woche' },
                  { key: 'monthly', label: 'Jeden Monat' }
                ].map((option) => {
                  const active = (eventForm.recurrenceType || 'none') === option.key;
                  return (
                    <Pressable
                      key={`event-recurrence-${option.key}`}
                      onPress={() => setEventRecurrenceType(option.key)}
                      style={[
                        styles.eventRecurrenceModeChip,
                        active && styles.eventRecurrenceModeChipActive
                      ]}
                    >
                      <Text
                        style={[
                          styles.eventRecurrenceModeText,
                          active && styles.eventRecurrenceModeTextActive
                        ]}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {eventForm.recurrenceType === 'weekly' || eventForm.recurrenceType === 'monthly' ? (
                <View style={styles.eventRecurrenceDetails}>
                  {eventForm.recurrenceType === 'weekly' ? (
                    <>
                      <Text style={[styles.helperText, compactHelperTextStyle]}>
                        Wähle die Wochentage, an denen dieses Event wiederkehrt.
                      </Text>
                      <View style={styles.eventWeekdayRow}>
                        {eventWeekdayOptions.map((day) => {
                          const active = normalizeEventWeekdaysForEdit(eventForm.recurrenceWeekdays).includes(day.key);
                          return (
                            <Pressable
                              key={`event-weekday-${day.key}`}
                              onPress={() => toggleEventFormWeekday(day.key)}
                              style={[styles.eventWeekdayChip, active && styles.eventWeekdayChipActive]}
                            >
                              <Text style={[styles.eventWeekdayText, active && styles.eventWeekdayTextActive]}>
                                {day.label}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </>
                  ) : (
                    <Text style={[styles.helperText, compactHelperTextStyle]}>
                      Das Event wiederholt sich jeden Monat am Kalendertag des ersten Starts.
                    </Text>
                  )}
                  <View style={styles.eventRecurrenceModeRow}>
                    {[
                      { key: 'open', label: 'Offen' },
                      { key: 'until', label: 'Bis Datum' }
                    ].map((option) => {
                      const active = (eventForm.recurrenceEndMode || 'open') === option.key;
                      return (
                        <Pressable
                          key={`event-recurrence-end-${option.key}`}
                          onPress={() => updateEventForm('recurrenceEndMode', option.key)}
                          style={[
                            styles.eventRecurrenceModeChip,
                            active && styles.eventRecurrenceModeChipActive
                          ]}
                        >
                          <Text
                            style={[
                              styles.eventRecurrenceModeText,
                              active && styles.eventRecurrenceModeTextActive
                            ]}
                          >
                            {option.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  {eventForm.recurrenceEndMode === 'until' ? (
                    <Pressable
                      style={styles.eventDatePickerButton}
                      onPress={() => openEventDateTimePicker('recurrenceEndAtText', 'date')}
                    >
                      <Ionicons name="calendar-outline" size={17} color={colors.accent} />
                      <Text style={styles.eventDatePickerButtonText}>
                        {formatEventDatePickerLabel(eventForm.recurrenceEndAtText)}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : (
                <Text style={[styles.helperText, compactHelperTextStyle]}>
                  Über „Termin hinzufügen“ kannst du weitere Termine mit eigenem Start und Ende anlegen.
                </Text>
              )}
            </View>
            <View style={styles.eventTagEditorRow}>
              {eventTagOptions.map((option) => {
                const active = eventForm.tags.includes(option.key);
                const primary = eventForm.primaryTag === option.key;
                return (
                  <Pressable
                    key={`event-form-tag-${option.key}`}
                    onPress={() => toggleEventFormTag(option.key)}
                    onLongPress={() => active && updateEventForm('primaryTag', option.key)}
                    style={[
                      styles.eventTagEditorChip,
                      active && styles.eventTagEditorChipActive,
                      primary && styles.eventTagEditorChipPrimary
                    ]}
                  >
                    <Ionicons name={option.icon} size={13} color={active ? colors.white : colors.ink} />
                    <Text style={[styles.eventTagEditorText, active && styles.eventTagEditorTextActive]}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={[styles.helperText, compactHelperTextStyle]}>
              Langer Druck auf ein aktives Hashtag setzt es als primäres Design.
            </Text>
            <TextInput
              value={eventForm.ticketUrl}
              onChangeText={(value) => updateEventForm('ticketUrl', value)}
              placeholder="Ticket-/Reservierungslink optional"
              autoCapitalize="none"
              keyboardType="url"
              style={[styles.input, compactInputStyle]}
            />
            <TextInput
              value={eventForm.contactUrl}
              onChangeText={(value) => updateEventForm('contactUrl', value)}
              placeholder="Kontaktlink optional"
              autoCapitalize="none"
              keyboardType="url"
              style={[styles.input, compactInputStyle]}
            />
            <TextInput
              value={eventForm.contactEmail}
              onChangeText={(value) => updateEventForm('contactEmail', value)}
              placeholder="Kontakt-E-Mail optional"
              autoCapitalize="none"
              keyboardType="email-address"
              style={[styles.input, compactInputStyle]}
            />
            <TextInput
              value={eventForm.contactPhone}
              onChangeText={(value) => updateEventForm('contactPhone', value)}
              placeholder="Kontakt-Telefon optional"
              keyboardType="phone-pad"
              style={[styles.input, compactInputStyle]}
            />
            <View style={styles.eventSocialEditorBox}>
              <Pressable
                style={styles.eventSocialEditorToggle}
                onPress={() => setEventSocialLinksOpen((open) => !open)}
              >
                <View style={styles.eventSocialEditorToggleTextWrap}>
                  <Text style={styles.eventSocialEditorTitle}>Social Media (optional)</Text>
                  {eventForm.socialLinks?.length ? (
                    <Text style={styles.eventSocialEditorHint}>
                      {eventForm.socialLinks.length} Link{eventForm.socialLinks.length === 1 ? '' : 's'}
                    </Text>
                  ) : null}
                </View>
                <Ionicons
                  name={eventSocialLinksOpen ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={colors.ink}
                />
              </Pressable>
              {eventSocialLinksOpen ? (
                <View style={styles.eventSocialEditorContent}>
                  {(Array.isArray(eventForm.socialLinks) ? eventForm.socialLinks : []).map((entry, index) => (
                    <View key={`event-social-${index}`} style={styles.socialLinkEditorRow}>
                      <TextInput
                        value={entry.platform}
                        onChangeText={(value) => updateEventSocialLink(index, 'platform', value)}
                        placeholder="Instagram, TikTok..."
                        style={[styles.input, compactInputStyle, styles.socialLinkPlatformInput]}
                      />
                      <TextInput
                        value={entry.url}
                        onChangeText={(value) => updateEventSocialLink(index, 'url', value)}
                        placeholder="https://..."
                        autoCapitalize="none"
                        autoCorrect={false}
                        keyboardType="url"
                        style={[styles.input, compactInputStyle, styles.socialLinkUrlInput]}
                      />
                      <Pressable style={styles.socialLinkRemoveButton} onPress={() => removeEventSocialLink(index)}>
                        <Ionicons name="trash-outline" size={16} color={colors.accentWarm} />
                      </Pressable>
                    </View>
                  ))}
                  <Pressable style={styles.outlineButton} onPress={addEventSocialLink}>
                    <Text style={styles.outlineButtonText}>Social-Link hinzufügen</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
            <ToggleSwitch
              label="Event öffentlich aktiv"
              value={Boolean(eventForm.active)}
              onPress={() => updateEventForm('active', !eventForm.active)}
              compact
            />
            <Pressable style={[styles.outlineButton, styles.eventImageButton]} onPress={handlePickEventImage}>
              <Ionicons name="image-outline" size={17} color={colors.accent} />
              <Text style={styles.outlineButtonText}>
                {eventForm.imageUrl ? 'Eventbild ändern' : 'Eventbild optional'}
              </Text>
            </Pressable>
            <View style={styles.eventPreviewColumn}>
              <Text style={styles.settingsSectionLabel}>Vorschau</Text>
              <EventCard event={previewEvent} favorite={false} compact />
            </View>
            {eventStatus ? (
              <View
                style={[styles.eventFormFeedback, styles.eventFormFeedbackSuccess]}
                accessibilityRole="alert"
              >
                <Ionicons name="checkmark-circle-outline" size={20} color={colors.accentCool} />
                <Text style={[styles.eventFormFeedbackText, styles.eventFormFeedbackSuccessText]}>
                  {eventStatus}
                </Text>
              </View>
            ) : null}
            {eventError || restaurantError ? (
              <View
                style={[styles.eventFormFeedback, styles.eventFormFeedbackError]}
                accessibilityRole="alert"
              >
                <Ionicons name="alert-circle-outline" size={20} color={colors.accentWarm} />
                <View style={styles.eventFormFeedbackTextWrap}>
                  {eventError ? (
                    <Text style={[styles.eventFormFeedbackText, styles.eventFormFeedbackErrorText]}>
                      {eventError}
                    </Text>
                  ) : null}
                  {restaurantError && restaurantError !== eventError ? (
                    <Text style={[styles.eventFormFeedbackText, styles.eventFormFeedbackErrorText]}>
                      {restaurantError}
                    </Text>
                  ) : null}
                </View>
              </View>
            ) : null}
            <View style={styles.eventEditorActions}>
              <Pressable
                style={[
                  styles.button,
                  styles.eventEditorActionButton,
                  isSmallPhone && styles.buttonCompactSmallPhone
                ]}
                onPress={handleSubmitRestaurantEvent}
                disabled={restaurantLoading}
              >
                <Text style={styles.buttonText} numberOfLines={1}>
                  {restaurantLoading ? 'Bitte warten...' : eventForm.id ? 'Event speichern' : 'Event erstellen'}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.outlineButton, styles.eventEditorActionButton]}
                onPress={() => resetEventForm()}
              >
                <Text style={styles.outlineButtonText} numberOfLines={1}>Abbrechen</Text>
              </Pressable>
            </View>
          </View>
          ) : null}
      </View>
    );
  };

  const settingsPageTitleByKey = {
    root: 'Einstellungen',
    profile: 'Profil',
    security: 'Sicherheit',
    visibility: 'Sichtbarkeit & Zeiten',
    reservation: 'Tischreservierung',
    services: 'Events & Catering'
  };

  const renderSettingsNavigationRow = ({ page, icon, title: rowTitle, description, value }) => (
    <Pressable
      key={page}
      onPress={() => openSettingsPage(page)}
      style={({ pressed }) => [styles.settingsNavigationRow, pressed && styles.settingsNavigationRowPressed]}
    >
      <View style={styles.settingsNavigationIcon}>
        <Ionicons name={icon} size={21} color={colors.ink} />
      </View>
      <View style={styles.settingsNavigationText}>
        <Text style={styles.settingsNavigationTitle}>{rowTitle}</Text>
        <Text style={styles.settingsNavigationDescription} numberOfLines={2}>{description}</Text>
        {value ? <Text style={styles.settingsNavigationValue} numberOfLines={1}>{value}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={19} color={colors.muted} />
    </Pressable>
  );

  const renderEditableSettingsField = ({
    label,
    value,
    onChangeText,
    placeholder,
    keyboardType,
    multiline = false,
    maxLength,
    secureTextEntry = false,
    passwordFieldKey,
    autoCapitalize,
    autoCorrect
  }) => {
    const visible = passwordFieldKey ? isPasswordVisible(passwordFieldKey) : false;
    return (
      <View style={styles.settingsEditableField}>
        <View style={styles.settingsEditableFieldHeader}>
          <Text style={styles.settingsEditableFieldLabel}>{label}</Text>
          <Ionicons name="pencil-outline" size={14} color={colors.accent} />
        </View>
        {secureTextEntry ? (
          <View style={styles.passwordFieldWrap}>
            <TextInput
              value={value}
              onChangeText={onChangeText}
              placeholder={placeholder}
              keyboardType={keyboardType}
              maxLength={maxLength}
              secureTextEntry={!visible}
              autoCapitalize={autoCapitalize}
              autoCorrect={autoCorrect}
              style={[styles.input, compactInputStyle, styles.settingsEditableInput, styles.passwordInput]}
            />
            <Pressable
              style={styles.passwordVisibilityButton}
              onPress={() => togglePasswordVisibility(passwordFieldKey)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={visible ? 'Passwort verbergen' : 'Passwort anzeigen'}
            >
              <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.muted} />
            </Pressable>
          </View>
        ) : (
          <TextInput
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            keyboardType={keyboardType}
            multiline={multiline}
            maxLength={maxLength}
            autoCapitalize={autoCapitalize}
            autoCorrect={autoCorrect}
            textAlignVertical={multiline ? 'top' : 'center'}
            style={[
              styles.input,
              compactInputStyle,
              styles.settingsEditableInput,
              multiline && styles.settingsEditableTextArea
            ]}
          />
        )}
      </View>
    );
  };

  const renderSettingsFeedback = () => {
    const message = settingsFeedback || (settingsPage !== 'root' ? restaurantError : '');
    if (!message) return null;
    const isSuccess = /gespeichert|geändert/i.test(message);
    return (
      <View style={[styles.settingsFeedback, isSuccess ? styles.settingsFeedbackSuccess : styles.settingsFeedbackError]}>
        <Ionicons
          name={isSuccess ? 'checkmark-circle-outline' : 'alert-circle-outline'}
          size={18}
          color={isSuccess ? colors.accentCool : colors.accentWarm}
        />
        <Text style={styles.settingsFeedbackText}>{message}</Text>
      </View>
    );
  };

  const renderSettingsSaveActions = (section, { returnToRoot = true } = {}) => (
    <View style={styles.settingsActions}>
      <Pressable
        style={[styles.button, isSmallPhone && styles.buttonCompactSmallPhone]}
        onPress={() => handleSaveRestaurantSettings({ section, returnToRoot })}
        disabled={restaurantLoading}
      >
        <Text style={styles.buttonText}>
          {restaurantLoading ? 'Bitte warten...' : 'Änderungen speichern'}
        </Text>
      </Pressable>
      <Pressable style={styles.outlineButton} onPress={() => setSettingsPage('root')}>
        <Text style={styles.outlineButtonText}>Abbrechen</Text>
      </Pressable>
    </View>
  );

  const renderSettingsRoot = () => {
    const eventsActive = normalizeProviderScopesForEdit(settingsProviderScopes).includes('events');
    const cateringActive = normalizeProviderScopesForEdit(settingsProviderScopes).includes('catering');
    return (
      <View style={styles.settingsNavigationCard}>
        {renderSettingsNavigationRow({
          page: 'profile',
          icon: 'person-outline',
          title: 'Profil',
          description: 'Kontaktdaten, Logo, Über uns und Social Media',
          value: settingsName || restaurant?.name
        })}
        {renderSettingsNavigationRow({
          page: 'security',
          icon: 'shield-checkmark-outline',
          title: 'Sicherheit',
          description: 'Passwort sicher ändern'
        })}
        {renderSettingsNavigationRow({
          page: 'visibility',
          icon: 'eye-outline',
          title: 'Sichtbarkeit & Öffnungszeiten',
          description: 'Angebotsbereiche, Restaurant-Art, Zeiten und Schließtage'
        })}
        {renderSettingsNavigationRow({
          page: 'reservation',
          icon: 'calendar-outline',
          title: 'Tischreservierung',
          description: 'Reservierung über App oder externe Kontakte'
        })}
        {eventsEnabled || cateringEnabled
          ? renderSettingsNavigationRow({
              page: 'services',
              icon: 'sparkles-outline',
              title: 'Events & Catering',
              description: 'Events und Catering-Angebot mit Kontakten verwalten',
              value: [
                eventsEnabled ? `Events ${eventsActive ? 'aktiv' : 'nicht aktiv'}` : null,
                cateringEnabled ? `Catering ${cateringActive ? 'aktiv' : 'nicht aktiv'}` : null
              ].filter(Boolean).join(' · ')
            })
          : null}
      </View>
    );
  };

  const renderProfileSettings = () => (
    <>
      <View style={[styles.settingsSection, isSmallPhone && styles.settingsSectionSmallPhone]}>
        <Text style={styles.settingsSectionLabel}>Öffentliches Profil</Text>
        <Text style={styles.settingsHint}>Diese Angaben sehen Nutzer in der Suche und im Restaurantprofil.</Text>
        {renderEditableSettingsField({
          label: 'Name',
          value: settingsName,
          onChangeText: setSettingsName,
          placeholder: 'Restaurantname'
        })}
        {renderEditableSettingsField({
          label: 'E-Mail-Adresse',
          value: settingsEmail,
          onChangeText: setSettingsEmail,
          placeholder: 'E-Mail-Adresse',
          keyboardType: 'email-address',
          autoCapitalize: 'none',
          autoCorrect: false
        })}
        {renderEditableSettingsField({
          label: 'Telefon',
          value: settingsPhone,
          onChangeText: setSettingsPhone,
          placeholder: 'Telefonnummer',
          keyboardType: 'phone-pad'
        })}
        {renderEditableSettingsField({
          label: 'Adresse',
          value: settingsAddress,
          onChangeText: setSettingsAddress,
          placeholder: 'Straße und Ort'
        })}
        {renderEditableSettingsField({
          label: 'Postleitzahl',
          value: settingsPostalCode,
          onChangeText: setSettingsPostalCode,
          placeholder: 'Postleitzahl',
          keyboardType: 'number-pad',
          maxLength: 12
        })}
      </View>

      <View style={[styles.settingsSection, isSmallPhone && styles.settingsSectionSmallPhone]}>
        <View style={styles.settingsEditableFieldHeader}>
          <Text style={styles.settingsSectionLabel}>Logo</Text>
          <Ionicons name="pencil-outline" size={14} color={colors.accent} />
        </View>
        <Text style={styles.settingsHint}>Das Logo erscheint bei deinem Restaurant, wenn eines hinterlegt ist.</Text>
        {settingsLogoUri ? (
          <Image source={{ uri: settingsLogoUri }} style={styles.settingsLogoPreview} />
        ) : (
          <View style={styles.settingsLogoEmpty}>
            <Ionicons name="image-outline" size={28} color={colors.muted} />
            <Text style={styles.settingsCollapsedHint}>Noch kein Logo hinterlegt</Text>
          </View>
        )}
        <Pressable
          style={styles.imageButton}
          onPress={handlePickRestaurantLogo}
          disabled={settingsLogoUploading || restaurantLoading}
        >
          <Ionicons name="image-outline" size={18} color={colors.ink} />
          <Text style={styles.imageButtonText}>
            {settingsLogoUploading ? 'Logo wird hochgeladen...' : 'Logo ändern'}
          </Text>
        </Pressable>
      </View>

      <View style={[styles.settingsSection, isSmallPhone && styles.settingsSectionSmallPhone]}>
        {renderEditableSettingsField({
          label: 'Über uns',
          value: settingsAboutText,
          onChangeText: setSettingsAboutText,
          placeholder: 'Spezialitäten, Atmosphäre oder Geschichte deines Restaurants',
          multiline: true,
          maxLength: 2000
        })}
      </View>

      {websiteSyncEnabled ? (
        <View style={[styles.settingsSection, isSmallPhone && styles.settingsSectionSmallPhone]}>
          {renderEditableSettingsField({
            label: 'Website für Synchronisierung',
            value: settingsWebsiteSyncUrl,
            onChangeText: setSettingsWebsiteSyncUrl,
            placeholder: 'https://www.dein-restaurant.de',
            keyboardType: 'url',
            autoCapitalize: 'none',
            autoCorrect: false
          })}
          <Text style={styles.settingsHint}>
            Diese Adresse wird nur für deine manuell gestartete Website-Synchronisierung genutzt.
          </Text>
        </View>
      ) : null}

      <View style={[styles.settingsSection, isSmallPhone && styles.settingsSectionSmallPhone]}>
        <View style={styles.settingsEditableFieldHeader}>
          <Text style={styles.settingsSectionLabel}>Social Media & Website</Text>
          <Ionicons name="pencil-outline" size={14} color={colors.accent} />
        </View>
        <Text style={styles.settingsHint}>Füge nur Links hinzu, die öffentlich im Profil erscheinen sollen.</Text>
        {normalizeSocialLinksForEdit(settingsSocialLinks).map((entry, index) => (
          <View key={`social-link-${index}`} style={styles.socialLinkEditorRow}>
            <TextInput
              value={entry.platform}
              onChangeText={(value) => updateSettingsSocialLink(index, 'platform', value)}
              placeholder="Instagram, Website..."
              style={[styles.input, compactInputStyle, styles.socialLinkPlatformInput]}
            />
            <TextInput
              value={entry.url}
              onChangeText={(value) => updateSettingsSocialLink(index, 'url', value)}
              placeholder="https://..."
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              style={[styles.input, compactInputStyle, styles.socialLinkUrlInput]}
            />
            <Pressable style={styles.socialLinkRemoveButton} onPress={() => removeSettingsSocialLink(index)}>
              <Ionicons name="trash-outline" size={16} color={colors.accentWarm} />
            </Pressable>
          </View>
        ))}
        <Pressable style={styles.outlineButton} onPress={addSettingsSocialLink}>
          <Text style={styles.outlineButtonText}>Weiteren Link hinzufügen</Text>
        </Pressable>
      </View>
      {renderSettingsFeedback()}
      {renderSettingsSaveActions('profile')}
    </>
  );

  const renderSecuritySettings = () => (
    <>
      <View style={[styles.settingsSection, isSmallPhone && styles.settingsSectionSmallPhone]}>
        <Text style={styles.settingsSectionLabel}>Passwort ändern</Text>
        <Text style={styles.settingsHint}>
          Nach der Änderung werden alle angemeldeten Geräte aus Sicherheitsgründen abgemeldet.
        </Text>
        {renderEditableSettingsField({
          label: 'Aktuelles Passwort',
          value: settingsCurrentPassword,
          onChangeText: setSettingsCurrentPassword,
          placeholder: 'Aktuelles Passwort',
          secureTextEntry: true,
          passwordFieldKey: 'settingsCurrent',
          autoCapitalize: 'none',
          autoCorrect: false
        })}
        {renderEditableSettingsField({
          label: 'Neues Passwort',
          value: settingsNewPassword,
          onChangeText: setSettingsNewPassword,
          placeholder: 'Mindestens 6 Zeichen',
          secureTextEntry: true,
          passwordFieldKey: 'settingsNew',
          autoCapitalize: 'none',
          autoCorrect: false
        })}
        {renderEditableSettingsField({
          label: 'Neues Passwort wiederholen',
          value: settingsNewPasswordConfirm,
          onChangeText: setSettingsNewPasswordConfirm,
          placeholder: 'Neues Passwort wiederholen',
          secureTextEntry: true,
          passwordFieldKey: 'settingsNewConfirm',
          autoCapitalize: 'none',
          autoCorrect: false
        })}
      </View>
      {renderSettingsFeedback()}
      <View style={styles.settingsActions}>
        <Pressable style={styles.button} onPress={handleChangeSettingsPassword} disabled={restaurantLoading}>
          <Text style={styles.buttonText}>{restaurantLoading ? 'Bitte warten...' : 'Passwort ändern'}</Text>
        </Pressable>
        <Pressable style={styles.outlineButton} onPress={() => setSettingsPage('root')}>
          <Text style={styles.outlineButtonText}>Abbrechen</Text>
        </Pressable>
      </View>
    </>
  );

  const renderVisibilitySettings = () => (
    <>
      <View style={[styles.settingsSection, isSmallPhone && styles.settingsSectionSmallPhone]}>
        <Text style={styles.settingsSectionLabel}>Sichtbarkeit</Text>
        <Text style={styles.settingsHint}>Wähle, in welchen Essensbereichen dein Restaurant gefunden wird.</Text>
        <View style={styles.settingsMealSlotRow}>
          {mealSlotOptions.map((option) => (
            <MealSlotChip
              key={option.key}
              label={option.label}
              active={settingsSlotList.includes(option.key)}
              onPress={() =>
                setSettingsMealSlots((current) => toggleMealSlot(normalizeMealSlots(current), option.key))
              }
            />
          ))}
        </View>
      </View>
      <View style={[styles.settingsSection, isSmallPhone && styles.settingsSectionSmallPhone]}>
        <Text style={styles.settingsSectionLabel}>Art des Restaurants</Text>
        <Text style={styles.settingsHint}>Mehrere passende Küchenarten können ausgewählt werden.</Text>
        <View style={styles.cuisineRow}>
          {cuisineTypeOptions.map((cuisine) => (
            <Pressable
              key={cuisine}
              style={[styles.cuisineChip, settingsCuisineTypes.includes(cuisine) && styles.cuisineChipActive]}
              onPress={() => toggleCuisineType(cuisine)}
            >
              <Text style={[
                styles.cuisineChipText,
                settingsCuisineTypes.includes(cuisine) && styles.cuisineChipTextActive
              ]}>
                {cuisine}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      <View style={[styles.settingsSection, isSmallPhone && styles.settingsSectionSmallPhone]}>
        <Text style={styles.settingsSectionLabel}>Öffnungszeiten & Schließtage</Text>
        <Text style={styles.settingsHint}>Lege reguläre Zeiten und einzelne Ausnahmen fest.</Text>
        {renderOpeningHoursEditor({ showSpecialClosures: true })}
      </View>
      {renderSettingsFeedback()}
      {renderSettingsSaveActions('visibility')}
    </>
  );

  const renderReservationSettings = () => (
    <>
      <View style={[styles.settingsSection, isSmallPhone && styles.settingsSectionSmallPhone]}>
        <Text style={styles.settingsSectionLabel}>Wie sollen Gäste reservieren?</Text>
        <Text style={styles.settingsHint}>Wähle die passende Reservierungsart und hinterlege bei Bedarf Kontakte.</Text>
        {renderReservationModeChoices()}
        {renderReservationExternalFields()}
      </View>
      {renderSettingsFeedback()}
      {renderSettingsSaveActions('reservation')}
    </>
  );

  const renderEventSettings = ({ embedded = false } = {}) => {
    const eventsActive = normalizeProviderScopesForEdit(settingsProviderScopes).includes('events');
    return (
      <>
        <View style={[styles.settingsSection, isSmallPhone && styles.settingsSectionSmallPhone]}>
          <Pressable style={styles.settingsToggleRow} onPress={toggleSettingsEventsEnabled}>
            <View style={styles.settingsToggleTextWrap}>
              <Text style={styles.settingsSectionLabel}>Events anbieten</Text>
              <Text style={styles.settingsToggleState}>
                {eventsActive ? 'Aktiv: Du kannst Events veröffentlichen.' : 'Nicht aktiv'}
              </Text>
            </View>
            <View style={[styles.settingsSwitchTrack, eventsActive && styles.settingsSwitchTrackOn]}>
              <View style={[styles.settingsSwitchThumb, eventsActive && styles.settingsSwitchThumbOn]} />
            </View>
          </Pressable>
        </View>
        {eventsActive ? (
          <View style={[styles.settingsSection, isSmallPhone && styles.settingsSectionSmallPhone]}>
            <Text style={styles.settingsSectionLabel}>Event-Profil</Text>
            <Text style={styles.settingsHint}>Diese Angaben werden bei deinem Event-Anbieterprofil verwendet.</Text>
            {renderEditableSettingsField({
              label: 'Was bietest du an?',
              value: settingsEventOfferingsText,
              onChangeText: (value) => updateSettingsServiceField(setSettingsEventOfferingsText, value),
              placeholder: 'Zum Beispiel Konzerte, Sport, Kurse oder Märkte',
              multiline: true,
              maxLength: 2000
            })}
            {renderEditableSettingsField({
              label: 'Reservierungs- oder Ticket-Link',
              value: settingsEventReservationUrl,
              onChangeText: (value) => updateSettingsServiceField(setSettingsEventReservationUrl, value),
              placeholder: 'https://...',
              keyboardType: 'url',
              autoCapitalize: 'none',
              autoCorrect: false
            })}
            {renderEditableSettingsField({
              label: 'Kontakt-Link',
              value: settingsEventContactUrl,
              onChangeText: (value) => updateSettingsServiceField(setSettingsEventContactUrl, value),
              placeholder: 'https://...',
              keyboardType: 'url',
              autoCapitalize: 'none',
              autoCorrect: false
            })}
            {renderEditableSettingsField({
              label: 'Kontakt-E-Mail',
              value: settingsEventContactEmail,
              onChangeText: (value) => updateSettingsServiceField(setSettingsEventContactEmail, value),
              placeholder: 'events@anbieter.de',
              keyboardType: 'email-address',
              autoCapitalize: 'none',
              autoCorrect: false
            })}
            {renderEditableSettingsField({
              label: 'Kontakt-Telefon',
              value: settingsEventContactPhone,
              onChangeText: (value) => updateSettingsServiceField(setSettingsEventContactPhone, value),
              placeholder: 'Telefonnummer',
              keyboardType: 'phone-pad'
            })}
          </View>
        ) : (
          <Text style={styles.settingsDisabledInfo}>
            Aktiviere Events, um Angaben zu Angebot, Tickets, Reservierung und Kontakt zu hinterlegen.
          </Text>
        )}
        {!embedded ? renderSettingsFeedback() : null}
        {!embedded ? renderSettingsSaveActions('events') : null}
      </>
    );
  };

  const renderCateringSettings = ({ embedded = false } = {}) => {
    const cateringActive = normalizeProviderScopesForEdit(settingsProviderScopes).includes('catering');
    return (
      <>
        <View style={[styles.settingsSection, isSmallPhone && styles.settingsSectionSmallPhone]}>
          <Pressable style={styles.settingsToggleRow} onPress={toggleSettingsCateringEnabled}>
            <View style={styles.settingsToggleTextWrap}>
              <Text style={styles.settingsSectionLabel}>Catering anbieten</Text>
              <Text style={styles.settingsToggleState}>
                {cateringActive ? 'Aktiv: Dein Catering-Profil ist für Nutzer sichtbar.' : 'Nicht aktiv'}
              </Text>
            </View>
            <View style={[styles.settingsSwitchTrack, cateringActive && styles.settingsSwitchTrackOn]}>
              <View style={[styles.settingsSwitchThumb, cateringActive && styles.settingsSwitchThumbOn]} />
            </View>
          </Pressable>
        </View>
        {cateringActive ? (
          <View style={[styles.settingsSection, isSmallPhone && styles.settingsSectionSmallPhone]}>
            <Text style={styles.settingsSectionLabel}>Catering-Profil</Text>
            <Text style={styles.settingsHint}>
              Adresse, Logo und Social Links stammen aus deinem Profil. Beschreibe hier dein Angebot und die direkten Kontakte.
            </Text>
            <Pressable style={styles.settingsProfileLink} onPress={() => openSettingsPage('profile')}>
              <Ionicons name="person-outline" size={16} color={colors.accent} />
              <Text style={styles.settingsProfileLinkText}>Profil mit Adresse, Logo und Social Links öffnen</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.accent} />
            </Pressable>
            {renderEditableSettingsField({
              label: 'Was bietest du an?',
              value: settingsCateringOfferingsText,
              onChangeText: (value) => updateSettingsServiceField(setSettingsCateringOfferingsText, value),
              placeholder: 'Zum Beispiel Firmenfeiern, Buffets, Hochzeiten oder Fingerfood',
              multiline: true,
              maxLength: 2000
            })}
            {renderEditableSettingsField({
              label: 'Kontakt-Link',
              value: settingsCateringContactUrl,
              onChangeText: (value) => updateSettingsServiceField(setSettingsCateringContactUrl, value),
              placeholder: 'https://...',
              keyboardType: 'url',
              autoCapitalize: 'none',
              autoCorrect: false
            })}
            {renderEditableSettingsField({
              label: 'Kontakt-E-Mail',
              value: settingsCateringContactEmail,
              onChangeText: (value) => updateSettingsServiceField(setSettingsCateringContactEmail, value),
              placeholder: 'catering@anbieter.de',
              keyboardType: 'email-address',
              autoCapitalize: 'none',
              autoCorrect: false
            })}
            {renderEditableSettingsField({
              label: 'Kontakt-Telefon',
              value: settingsCateringContactPhone,
              onChangeText: (value) => updateSettingsServiceField(setSettingsCateringContactPhone, value),
              placeholder: 'Telefonnummer',
              keyboardType: 'phone-pad'
            })}
          </View>
        ) : (
          <Text style={styles.settingsDisabledInfo}>
            Aktiviere Catering, um dein Angebot, Adresse, Logo und öffentliche Kontakte zu veröffentlichen.
          </Text>
        )}
        {!embedded ? renderSettingsFeedback() : null}
        {!embedded ? renderSettingsSaveActions('catering') : null}
      </>
    );
  };

  const renderServicesSettings = () => {
    const activeTab = settingsServicesTab === 'catering' && cateringEnabled ? 'catering' : 'events';
    return (
      <>
        <View style={styles.settingsServiceTabs}>
          {eventsEnabled ? (
            <Pressable
              style={[styles.settingsServiceTab, activeTab === 'events' && styles.settingsServiceTabActive]}
              onPress={() => requestSettingsServicesTab('events')}
            >
              <Ionicons name="sparkles-outline" size={17} color={activeTab === 'events' ? colors.white : colors.ink} />
              <Text style={[styles.settingsServiceTabText, activeTab === 'events' && styles.settingsServiceTabTextActive]}>Events</Text>
            </Pressable>
          ) : null}
          {cateringEnabled ? (
            <Pressable
              style={[styles.settingsServiceTab, activeTab === 'catering' && styles.settingsServiceTabActive]}
              onPress={() => requestSettingsServicesTab('catering')}
            >
              <Ionicons name="briefcase-outline" size={17} color={activeTab === 'catering' ? colors.white : colors.ink} />
              <Text style={[styles.settingsServiceTabText, activeTab === 'catering' && styles.settingsServiceTabTextActive]}>Catering</Text>
            </Pressable>
          ) : null}
        </View>
        {activeTab === 'catering' ? renderCateringSettings({ embedded: true }) : renderEventSettings({ embedded: true })}
        {renderSettingsFeedback()}
        {renderSettingsSaveActions(activeTab, { returnToRoot: false })}
      </>
    );
  };

  const renderSettingsPageContent = () => {
    if (settingsPage === 'profile') return renderProfileSettings();
    if (settingsPage === 'security') return renderSecuritySettings();
    if (settingsPage === 'visibility') return renderVisibilitySettings();
    if (settingsPage === 'reservation') return renderReservationSettings();
    if (settingsPage === 'services' && (eventsEnabled || cateringEnabled)) return renderServicesSettings();
    return (
      <>
        {renderSettingsRoot()}
        {renderSettingsFeedback()}
      </>
    );
  };

  const renderWebsiteSyncModal = () => {
    const draft = websiteSyncDraft;
    const result = draft?.result || null;
    const handled = (section, sourceId = null) =>
      (sourceId && draft?.appliedSourceIds?.includes(sourceId)) ||
      (!sourceId && (draft?.appliedSections?.includes(section) || (section === 'dinner' && draft?.appliedSections?.includes('regular'))))
        ? 'übernommen'
        : (sourceId && draft?.skippedSourceIds?.includes(sourceId)) ||
          (!sourceId && (draft?.skippedSections?.includes(section) || (section === 'dinner' && draft?.skippedSections?.includes('regular'))))
        ? 'übersprungen'
        : '';
    const websiteSyncDays = [
      { key: 'mon', label: 'Mo' }, { key: 'tue', label: 'Di' }, { key: 'wed', label: 'Mi' },
      { key: 'thu', label: 'Do' }, { key: 'fri', label: 'Fr' }, { key: 'sat', label: 'Sa' }, { key: 'sun', label: 'So' }
    ];
    const openingHoursRows = websiteSyncDays
      .filter((day) => result?.openingHours?.[day.key]?.enabled)
      .map((day) => {
        const value = result.openingHours[day.key];
        return {
          ...day,
          key: day.key,
          signature: `${value.openTime}|${value.closeTime}|${Boolean(value.openEnded)}`,
          range: value.openEnded ? `${value.openTime} – Ende` : `${value.openTime} – ${value.closeTime}`
        };
      });
    const openingHoursSummary = openingHoursRows.reduce((groups, entry) => {
      const previous = groups[groups.length - 1];
      if (previous?.signature === entry.signature && previous.lastIndex === websiteSyncDays.findIndex((day) => day.key === entry.key) - 1) {
        previous.labels.push(entry.label);
        previous.lastIndex += 1;
        return groups;
      }
      groups.push({ signature: entry.signature, labels: [entry.label], range: entry.range, lastIndex: websiteSyncDays.findIndex((day) => day.key === entry.key) });
      return groups;
    }, []).map((group) => `${group.labels.length > 1 ? `${group.labels[0]}–${group.labels[group.labels.length - 1]}` : group.labels[0]} · ${group.range}`);
    const renderOpeningHours = () => {
      const section = 'openingHours';
      const title = 'Öffnungszeiten';
      const icon = 'time-outline';
      const available = openingHoursRows.length > 0;
      const status = handled(section);
      return (
        <View key={section} style={styles.websiteSyncSectionCard}>
          <View style={styles.websiteSyncSectionHead}>
            <View style={styles.websiteSyncSectionIcon}><Ionicons name={icon} size={19} color={colors.accent} /></View>
            <View style={styles.websiteSyncSectionCopy}>
              <Text style={styles.websiteSyncSectionTitle}>{title}</Text>
              <Text style={styles.websiteSyncSectionText}>
                {available ? openingHoursSummary.join('\n') : 'Keine vollständigen Öffnungszeiten erkannt.'}
              </Text>
              {Array.isArray(result?.openingHoursNotes) && result.openingHoursNotes.length ? (
                <Text style={styles.websiteSyncSourceText}>{result.openingHoursNotes.join('\n')}</Text>
              ) : null}
            </View>
            {status ? <Text style={styles.websiteSyncSectionStatus}>{status}</Text> : null}
          </View>
          {available && !status ? (
            <View style={styles.websiteSyncSectionActions}>
              <Pressable style={[styles.button, styles.websiteSyncPrimaryAction]} disabled={websiteSyncApplying === section} onPress={() => applyWebsiteSyncSection(section, 'replace')}>
                <Text style={styles.buttonText}>{websiteSyncApplying === section ? 'Wird übernommen...' : 'Übernehmen'}</Text>
              </Pressable>
              <Pressable style={styles.websiteSyncSkipAction} disabled={websiteSyncApplying === section} onPress={() => applyWebsiteSyncSection(section, 'skip')}>
                <Text style={styles.websiteSyncSkipText}>Überspringen</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      );
    };

    const areaInfo = {
      breakfast: { title: 'Frühstück', icon: 'cafe-outline' },
      lunch: { title: 'Mittagstisch', icon: 'sunny-outline' },
      dinner: { title: 'Abendessen', icon: 'restaurant-outline' },
      drinks: { title: 'Getränke', icon: 'wine-outline' },
      unclassified: { title: 'Bitte zuordnen', icon: 'help-circle-outline' }
    };
    const sourceLabel = (source) => {
      const sourceUrls = Array.isArray(source.sourceUrls) && source.sourceUrls.length
        ? source.sourceUrls
        : [source.sourceUrl].filter(Boolean);
      if (sourceUrls.length > 1) return `${sourceUrls.length} Quellen zusammengeführt`;
      try { return new URL(sourceUrls[0]).hostname.replace(/^www\./i, ''); } catch { return 'Website-Quelle'; }
    };
    const renderMenuSource = (source) => {
      const info = areaInfo[source.section] || areaInfo.unclassified;
      const status = handled(source.section, source.id);
      const selectedCount = source.items?.filter((item) => websiteSyncSelectedItems?.[source.id]?.[item.id]).length || 0;
      const busy = websiteSyncApplying === source.id;
      return (
        <View key={source.id} style={styles.websiteSyncSectionCard}>
          <View style={styles.websiteSyncSectionHead}>
            <View style={styles.websiteSyncSectionIcon}><Ionicons name={info.icon} size={19} color={colors.accent} /></View>
            <View style={styles.websiteSyncSectionCopy}>
              <Text style={styles.websiteSyncSectionTitle}>{info.title}</Text>
              <Text style={styles.websiteSyncSectionText}>{source.items?.length || 0} eindeutige Gerichte{source.items?.filter((item) => item.price == null).length ? ` · ${source.items.filter((item) => item.price == null).length} Preis ergänzen` : ''}</Text>
              <Text style={styles.websiteSyncSourceText} numberOfLines={1}>{sourceLabel(source)} · {source.confidence === 'high' ? 'sicher erkannt' : source.confidence === 'medium' ? 'bitte prüfen' : 'manuell zuordnen'}</Text>
            </View>
            {status ? <Text style={styles.websiteSyncSectionStatus}>{status}</Text> : null}
          </View>
          {!status ? (
            <View style={styles.websiteSyncSectionActions}>
              <Pressable style={[styles.websiteSyncPreviewAction]} onPress={() => setWebsiteSyncPreviewArea(source.id)}>
                <Ionicons name="list-outline" size={16} color={colors.accent} />
                <Text style={styles.websiteSyncPreviewText}>Gerichte ansehen</Text>
              </Pressable>
              {source.section === 'unclassified' ? (
                <View style={styles.websiteSyncAssignActions}>
                  {['breakfast', 'lunch', 'dinner', 'drinks'].map((target) => (
                    <Pressable key={target} style={styles.websiteSyncAssignButton} disabled={busy} onPress={() => Alert.alert(
                      `Als ${areaInfo[target].title} übernehmen`,
                      'Möchtest du die ausgewählten Gerichte ergänzen oder den bestehenden Bereich ersetzen?',
                      [
                        { text: 'Abbrechen', style: 'cancel' },
                        { text: 'Erweitern', onPress: () => applyWebsiteSyncSection('unclassified', 'append', source, target) },
                        { text: 'Ersetzen', style: 'destructive', onPress: () => applyWebsiteSyncSection('unclassified', 'replace', source, target) }
                      ]
                    )}>
                      <Text style={styles.websiteSyncAssignText}>Als {areaInfo[target].title}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : (
                <>
                  <Pressable style={[styles.outlineButton, styles.websiteSyncMenuAction]} disabled={busy} onPress={() => applyWebsiteSyncSection(source.section, 'append', source)}>
                    <Text style={styles.outlineButtonText}>Erweitern</Text>
                  </Pressable>
                  <Pressable style={[styles.button, styles.websiteSyncMenuAction]} disabled={busy} onPress={() => applyWebsiteSyncSection(source.section, 'replace', source)}>
                    <Text style={styles.buttonText}>{busy ? 'Wird übernommen...' : 'Ersetzen'}</Text>
                  </Pressable>
                </>
              )}
              <Text style={styles.websiteSyncSelectionText}>{selectedCount} ausgewählt</Text>
              <Pressable style={styles.websiteSyncSkipAction} disabled={busy} onPress={() => applyWebsiteSyncSection(source.section, 'skip', source)}>
                <Text style={styles.websiteSyncSkipText}>Überspringen</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      );
    };

    const previewMenu = websiteSyncPreviewArea ? getWebsiteSyncSources(result).find((source) => source.id === websiteSyncPreviewArea) || null : null;
    const previewSelected = previewMenu?.items?.filter((item) => websiteSyncSelectedItems?.[websiteSyncPreviewArea]?.[item.id]).length || 0;
    const togglePreviewItem = (itemId) => {
      if (!websiteSyncPreviewArea) return;
      setWebsiteSyncSelectedItems((current) => ({
        ...current,
        [websiteSyncPreviewArea]: {
          ...(current[websiteSyncPreviewArea] || {}),
          [itemId]: !current?.[websiteSyncPreviewArea]?.[itemId]
        }
      }));
    };

    return (
      <>
        <Modal visible={websiteSyncOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => websiteSyncPreviewArea ? setWebsiteSyncPreviewArea(null) : closeWebsiteSync()}>
          <KeyboardAvoidingView style={styles.websiteSyncScreen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {websiteSyncPreviewArea ? (
            <View style={styles.websiteSyncScreen}>
              <View style={styles.websiteSyncHeader}>
                <Pressable style={styles.settingsModalHeaderButton} onPress={() => setWebsiteSyncPreviewArea(null)}><Ionicons name="chevron-back" size={23} color={colors.ink} /></Pressable>
                <View style={styles.websiteSyncHeaderCopy}>
                  <Text style={styles.websiteSyncHeaderTitle}>Gerichte prüfen</Text>
                  <Text style={styles.websiteSyncHeaderText}>{previewSelected} von {previewMenu?.items?.length || 0} werden übernommen</Text>
                </View>
                <View style={styles.websiteSyncHeaderIcon}><Ionicons name="checkmark-done-outline" size={20} color={colors.accent} /></View>
              </View>
              <ScrollView contentContainerStyle={styles.websiteSyncPreviewScroll} showsVerticalScrollIndicator={false}>
                <Text style={styles.websiteSyncPreviewHint}>Falsche Gerichte kannst du hier abwählen. Erst bei Ersetzen oder Erweitern werden die ausgewählten Gerichte übernommen.</Text>
                {(previewMenu?.items || []).map((item) => {
                  const selected = Boolean(websiteSyncSelectedItems?.[websiteSyncPreviewArea]?.[item.id]);
                  return (
                    <Pressable key={item.id} onPress={() => togglePreviewItem(item.id)} style={[styles.websiteSyncDishCard, selected && styles.websiteSyncDishCardSelected]}>
                      <View style={[styles.websiteSyncDishCheck, selected && styles.websiteSyncDishCheckSelected]}>
                        <Ionicons name={selected ? 'checkmark' : 'remove'} size={16} color={selected ? colors.white : colors.muted} />
                      </View>
                      <View style={styles.websiteSyncDishCopy}>
                        <View style={styles.websiteSyncDishTopLine}>
                          <Text style={styles.websiteSyncDishName}>{item.name}</Text>
                          {item.price == null ? (
                            <TextInput
                              value={websiteSyncPriceOverrides?.[item.id] || ''}
                              onChangeText={(value) => setWebsiteSyncPriceOverrides((current) => ({ ...current, [item.id]: value }))}
                              placeholder="Preis"
                              placeholderTextColor={colors.muted}
                              keyboardType="decimal-pad"
                              style={styles.websiteSyncDishPriceInput}
                            />
                          ) : <Text style={styles.websiteSyncDishPrice}>{formatPrice(item.price)}</Text>}
                        </View>
                        {item.description ? <Text style={styles.websiteSyncDishDescription}>{item.description}</Text> : null}
                        <View style={styles.websiteSyncDishMeta}>
                          <Text style={styles.websiteSyncDishCategory}>{item.category}</Text>
                          {item.allergens?.length ? <Text style={styles.websiteSyncDishAllergens}>Allergene: {item.allergens.join(', ')}</Text> : null}
                          {(item.sourceUrl || item.sourceUrls?.length) ? <Text style={styles.websiteSyncDishSources}>Quelle: {sourceLabel(item)}</Text> : null}
                        </View>
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <View style={styles.websiteSyncPreviewFooter}><Pressable style={styles.button} onPress={() => setWebsiteSyncPreviewArea(null)}><Text style={styles.buttonText}>Auswahl übernehmen</Text></Pressable></View>
            </View>
          ) : (
            <>
          <View style={styles.websiteSyncHeader}>
            <Pressable style={styles.settingsModalHeaderButton} onPress={closeWebsiteSync}><Ionicons name="close" size={22} color={colors.ink} /></Pressable>
            <View style={styles.websiteSyncHeaderCopy}>
              <Text style={styles.websiteSyncHeaderTitle}>Website synchronisieren</Text>
              <Text style={styles.websiteSyncHeaderText}>Du bestätigst jeden Bereich selbst.</Text>
            </View>
            <View style={styles.websiteSyncHeaderIcon}><Ionicons name="globe-outline" size={20} color={colors.accent} /></View>
          </View>
          <ScrollView contentContainerStyle={styles.websiteSyncScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {!draft ? (
              <View style={styles.websiteSyncIntroCard}>
                <View style={styles.websiteSyncIntroIcon}><Ionicons name="link-outline" size={26} color={colors.accent} /></View>
                <Text style={styles.websiteSyncIntroTitle}>Deine Restaurant-Website prüfen</Text>
                <Text style={styles.websiteSyncIntroText}>Wir suchen Öffnungszeiten und Menükarten. Nichts wird automatisch geändert.</Text>
                <TextInput value={websiteSyncUrl} onChangeText={(value) => { setWebsiteSyncUrl(value); setWebsiteSyncError(''); }} placeholder="https://www.dein-restaurant.de" keyboardType="url" autoCapitalize="none" autoCorrect={false} style={[styles.input, styles.websiteSyncUrlInput]} />
                {websiteSyncError ? <Text style={styles.errorText}>{websiteSyncError}</Text> : null}
                <Pressable style={styles.button} onPress={startWebsiteSync}><Ionicons name="sync-outline" size={18} color={colors.white} /><Text style={styles.buttonText}>Website prüfen</Text></Pressable>
              </View>
            ) : null}
            {draft?.status === 'running' ? (
              <View style={styles.websiteSyncProgressCard}>
                <View style={styles.websiteSyncProgressHead}><Ionicons name="sync-outline" size={22} color={colors.accent} /><Text style={styles.websiteSyncProgressTitle}>{draft.step || 'Website wird geprüft'}</Text></View>
                <View style={styles.websiteSyncProgressTrack}><View style={[styles.websiteSyncProgressFill, { width: `${Math.max(5, Math.min(100, Number(draft.progress) || 5))}%` }]} /></View>
                <Text style={styles.websiteSyncProgressText}>{Math.max(5, Math.min(100, Number(draft.progress) || 5))}% · Bitte diese Ansicht geöffnet lassen.</Text>
              </View>
            ) : null}
            {draft?.status === 'failed' ? (
              <View style={styles.websiteSyncIntroCard}>
                <Ionicons name="alert-circle-outline" size={28} color={colors.accentWarm} />
                <Text style={styles.websiteSyncIntroTitle}>Website konnte nicht vollständig gelesen werden</Text>
                <Text style={styles.websiteSyncIntroText}>{draft.error?.message || 'Bitte Website-Adresse und Verbindung prüfen.'}</Text>
                <Pressable style={styles.button} onPress={startWebsiteSync}><Text style={styles.buttonText}>Erneut versuchen</Text></Pressable>
              </View>
            ) : null}
            {draft?.status === 'completed' && result ? (
              <>
                <View style={styles.websiteSyncReadyCard}>
                  <Ionicons name="checkmark-circle" size={23} color="#248B57" />
                  <View style={styles.websiteSyncReadyCopy}>
                    <Text style={styles.websiteSyncReadyTitle}>Entwurf bereit</Text>
                    <Text style={styles.websiteSyncReadyText}>Übernimm nur Bereiche, die zu deinem Restaurant passen.</Text>
                    {result?.menuScan?.checkedSources ? <Text style={styles.websiteSyncReadyMeta}>{result.menuScan.checkedSources} Quellen geprüft · {result.menuScan.analyzedSources || 0} erfolgreich analysiert</Text> : null}
                  </View>
                </View>
                <View style={styles.websiteSyncRepeatActions}>
                  <Pressable style={[styles.outlineButton, styles.websiteSyncRepeatButton]} onPress={() => { setWebsiteSyncDraft(null); setWebsiteSyncError(''); }}>
                    <Text style={styles.outlineButtonText}>Website ändern</Text>
                  </Pressable>
                  <Pressable style={[styles.button, styles.websiteSyncRepeatButton]} onPress={startWebsiteSync}>
                    <Ionicons name="refresh-outline" size={17} color={colors.white} />
                    <Text style={styles.buttonText}>Erneut synchronisieren</Text>
                  </Pressable>
                </View>
                {renderOpeningHours()}
                {getWebsiteSyncSources(result).length
                  ? getWebsiteSyncSources(result).map(renderMenuSource)
                  : <View style={styles.websiteSyncNoMenuCard}><Ionicons name="document-text-outline" size={20} color={colors.muted} /><Text style={styles.websiteSyncNoMenuText}>{result?.menuScan?.checkedSources ? `${result.menuScan.checkedSources} Menüquelle${result.menuScan.checkedSources === 1 ? '' : 'n'} geprüft, aber keine Gerichte erkannt. Du kannst später erneut synchronisieren oder die Karte manuell hochladen.` : 'Keine öffentliche Menüquelle gefunden. Du kannst die Öffnungszeiten trotzdem separat übernehmen oder später erneut synchronisieren.'}</Text></View>}
                {Array.isArray(result.warnings) && result.warnings.length ? <View style={styles.websiteSyncWarningCard}><Ionicons name="information-circle-outline" size={19} color={colors.accentWarm} /><Text style={styles.websiteSyncWarningText}>{result.warnings.join('\n')}</Text></View> : null}
              </>
            ) : null}
          </ScrollView>
            </>
          )}
          </KeyboardAvoidingView>
        </Modal>
      </>
    );
  };

  return (
    <LinearGradient colors={[colors.bgTop, colors.bgBottom]} style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          ref={scrollRef}
          scrollEnabled={!useViewportShell}
          contentContainerStyle={[
            styles.scrollContent,
            styles.scrollContentGrow,
            isCompactLayout && styles.scrollContentCompact,
            isSmallPhone && styles.scrollContentSmallPhone,
            restaurant && !isOnboardingMode && !activePanel && styles.dashboardScrollContent,
            useViewportShell && styles.scrollContentViewport,
            useViewportShell &&
              (Platform.OS === 'web'
                ? { minHeight: '100dvh', height: '100dvh', maxHeight: '100dvh' }
                : { minHeight: windowHeight, height: windowHeight, maxHeight: windowHeight }),
            restaurantTopOffsetStyle
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          onScrollBeginDrag={Keyboard.dismiss}
        >
          {restaurant ? (
            showDashboardChrome ? (
              <View style={[styles.dashboardTopBar, isSmallPhone && styles.dashboardTopBarSmallPhone]}>
                <View style={styles.dashboardRestaurantIdentity}>
                  <Image
                    source={restaurant?.logoUrl ? { uri: restaurant.logoUrl } : appIcon}
                    style={[styles.dashboardRestaurantLogo, isSmallPhone && styles.dashboardRestaurantLogoSmallPhone]}
                  />
                  <Text
                    style={[styles.dashboardRestaurantName, isSmallPhone && styles.dashboardRestaurantNameSmallPhone]}
                    numberOfLines={1}
                  >
                    {restaurant?.name || 'Restaurant'}
                  </Text>
                </View>
                {websiteSyncEnabled ? (
                  <Pressable
                    style={({ pressed }) => [styles.websiteSyncDashboardButton, pressed && styles.websiteSyncDashboardButtonPressed]}
                    onPress={openWebsiteSync}
                  >
                    <View style={styles.websiteSyncDashboardIcon}>
                      <Ionicons name="globe-outline" size={17} color={colors.accent} />
                    </View>
                    <View style={styles.websiteSyncDashboardCopy}>
                      <Text style={styles.websiteSyncDashboardTitle}>Website synchronisieren</Text>
                      <Text style={styles.websiteSyncDashboardText} numberOfLines={1}>
                        {restaurant?.websiteSyncUrl
                          ? getWebsiteSyncDomain(restaurant.websiteSyncUrl)
                          : 'Öffnungszeiten und Menüs als Entwurf prüfen'}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                  </Pressable>
                ) : null}
              </View>
            ) : null
          ) : (
            <View style={[styles.authHeroWrap, isSmallPhone && styles.authHeroWrapSmallPhone]}>
              <LinearGradient
                colors={['#8AB9FF', '#77ABFF', '#6D9EFF']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.authHero, isSmallPhone && styles.authHeroSmallPhone]}
              >
                {onBack ? (
                  <Pressable
                    onPress={onBack}
                    style={({ pressed }) => [styles.authBackButton, pressed && styles.iconPressed]}
                  >
                    <Ionicons name="arrow-back" size={18} color={colors.white} />
                  </Pressable>
                ) : null}
                <Image source={appIcon} style={[styles.authHeroLogo, isSmallPhone && styles.authHeroLogoSmallPhone]} />
                <Text style={[styles.authHeroTitle, isSmallPhone && styles.authHeroTitleSmallPhone]}>
                  Als Partner registrieren
                </Text>
                <Text style={[styles.authHeroSubtitle, isSmallPhone && styles.authHeroSubtitleSmallPhone]}>
                  Verwalte dein Profil, Angebote und Bestellungen direkt in der App.
                </Text>
              </LinearGradient>
            </View>
          )}

          <Modal
            visible={settingsOpen}
            transparent
            animationType="fade"
            onRequestClose={handleSettingsBack}
          >
            <View
              style={[
                styles.modalBackdrop,
                isCompactLayout && styles.modalBackdropCompact,
                isSmallPhone && styles.modalBackdropSmallPhone
              ]}
            >
              <View
                style={[
                  styles.modalCard,
                  isCompactLayout && styles.modalCardCompact,
                  isSmallPhone && styles.modalCardSmallPhone,
                  settingsModalSizeStyle,
                  modalTopOffsetStyle
                ]}
              >
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={[
                    styles.modalScrollContent,
                    isSmallPhone && styles.modalScrollContentSmallPhone,
                    { paddingBottom: Math.max(insets.bottom, spacing.sm) }
                  ]}
                  keyboardShouldPersistTaps="always"
                >
                <View style={styles.settingsModalHeader}>
                  <Pressable
                    style={styles.settingsModalHeaderButton}
                    onPress={handleSettingsBack}
                    accessibilityLabel={settingsPage === 'root' ? 'Einstellungen schließen' : 'Zurück'}
                  >
                    <Ionicons name="arrow-back" size={21} color={colors.ink} />
                  </Pressable>
                  <Text style={styles.settingsModalTitle} numberOfLines={1}>
                    {settingsPageTitleByKey[settingsPage] || 'Einstellungen'}
                  </Text>
                  <Pressable
                    style={styles.settingsModalHeaderButton}
                    onPress={() => setSettingsOpen(false)}
                    accessibilityLabel="Einstellungen schließen"
                  >
                    <Ionicons name="close" size={22} color={colors.ink} />
                  </Pressable>
                </View>
                {renderSettingsPageContent()}
                </ScrollView>
              </View>
            </View>
          </Modal>

          {websiteSyncEnabled ? renderWebsiteSyncModal() : null}

          <Modal
            visible={lunchValidityEditor.open}
            transparent
            animationType="fade"
            onRequestClose={closeLunchValidityEditor}
          >
            <View style={styles.eventPickerBackdrop}>
              <View style={[styles.eventPickerModalCard, styles.lunchValidityModalCard]}>
                <Text style={styles.eventPickerModalTitle}>
                  {lunchValidityEditor.suggestionType === 'dateRange'
                    ? lunchValidityEditor.detectedByAi
                      ? 'Zeitraum erkannt'
                      : 'Zeitraum ändern'
                    : lunchValidityEditor.suggestionType === 'weekdays'
                    ? lunchValidityEditor.detectedByAi
                      ? 'Wochentage erkannt'
                      : 'Wochentage ändern'
                    : 'Wann ist diese Mittagstisch-Karte gültig?'}
                </Text>
                {lunchValidityEditor.suggestionType === 'dateRange' ? (
                  <Text style={styles.settingsHint}>
                    {lunchValidityEditor.detectedByAi
                      ? 'Unser System hat diesen Zeitraum erkannt. Du kannst ihn direkt übernehmen oder ändern.'
                      : 'Du kannst den aktuellen Zeitraum mit den Date-Pickern ändern.'}
                  </Text>
                ) : lunchValidityEditor.suggestionType === 'weekdays' ? (
                  <Text style={styles.settingsHint}>
                    {lunchValidityEditor.detectedByAi
                      ? 'Unser System hat diese Wochentage erkannt. Du kannst sie direkt übernehmen oder ändern.'
                      : 'Du kannst die aktuellen Wochentage ändern.'}
                  </Text>
                ) : (
                  <Text style={styles.settingsHint}>
                    Wähle einen Start und optional ein Ende. Du kannst den Zeitraum auch später festlegen.
                  </Text>
                )}

                {lunchValidityEditor.suggestionType === 'weekdays' ? (
                  <View style={styles.mealSlotRowCompact}>
                    {lunchWeekdayOptions.map((option) => (
                      <MealSlotChip
                        key={`lunch-save-weekday-${option.key}`}
                        label={option.label}
                        compact
                        tiny
                        active={lunchValidityEditor.weekdays.includes(option.key)}
                        onPress={() =>
                          setLunchValidityEditor((prev) => ({
                            ...prev,
                            weekdays: prev.weekdays.includes(option.key)
                              ? prev.weekdays.filter((entry) => entry !== option.key)
                              : normalizeLunchMenuWeekdays([...prev.weekdays, option.key]),
                            error: ''
                          }))
                        }
                      />
                    ))}
                  </View>
                ) : (
                  <>
                    <View style={styles.lunchValidityDateRow}>
                      <Pressable
                        style={styles.lunchValidityDateButton}
                        onPress={() => openLunchDatePicker('bulk', 'fromDate')}
                      >
                        <Text style={styles.lunchValidityDateLabel}>Von</Text>
                        <Text style={styles.lunchValidityDateValue}>
                          {lunchValidityEditor.fromDate
                            ? formatIsoDateLabel(lunchValidityEditor.fromDate)
                            : 'Datum wählen'}
                        </Text>
                      </Pressable>
                      <Pressable
                        style={styles.lunchValidityDateButton}
                        onPress={() => openLunchDatePicker('bulk', 'toDate')}
                      >
                        <Text style={styles.lunchValidityDateLabel}>Bis</Text>
                        <Text style={styles.lunchValidityDateValue}>
                          {lunchValidityEditor.toDate
                            ? formatIsoDateLabel(lunchValidityEditor.toDate)
                            : 'Ohne Ende'}
                        </Text>
                      </Pressable>
                    </View>
                    {lunchValidityEditor.toDate ? (
                      <Pressable
                        style={styles.lunchValidityNoEndButton}
                        onPress={() =>
                          setLunchValidityEditor((prev) => ({ ...prev, toDate: '', error: '' }))
                        }
                      >
                        <Text style={styles.lunchValidityNoEndButtonText}>Bis: Ohne Ende</Text>
                      </Pressable>
                    ) : null}
                  </>
                )}

                {Platform.OS !== 'android' &&
                lunchDatePickerState.visible &&
                lunchDatePickerState.target === 'bulk' ? (
                  <View style={styles.lunchValidityInlinePickerCard}>
                    <Text style={styles.lunchValidityEditorTitle}>
                      {lunchDatePickerState.field === 'fromDate' ? 'Von-Datum wählen' : 'Bis-Datum wählen'}
                    </Text>
                    {Platform.OS === 'web' ? (
                      <ScrollView style={styles.lunchValidityWebDateList}>
                        {lunchValidityDateOptions.map((option) => (
                          <Pressable
                            key={`lunch-modal-date-${option.key}`}
                            style={styles.specialClosurePickerRow}
                            onPress={() => {
                              setLunchDatePickerValue('bulk', lunchDatePickerState.field, parseLunchIsoDate(option.key));
                              closeLunchDatePicker();
                            }}
                          >
                            <Text style={styles.specialClosurePickerRowText}>{option.label}</Text>
                          </Pressable>
                        ))}
                      </ScrollView>
                    ) : (
                      <DateTimePicker
                        value={lunchDatePickerState.value}
                        mode="date"
                        display="spinner"
                        onChange={handleLunchDatePickerChange}
                        style={styles.eventPickerSpinner}
                      />
                    )}
                    {Platform.OS !== 'web' ? (
                      <View style={styles.eventPickerModalActions}>
                        <Pressable
                          style={[styles.outlineButton, styles.eventPickerModalActionButton]}
                          onPress={closeLunchDatePicker}
                        >
                          <Text style={styles.outlineButtonText}>Abbrechen</Text>
                        </Pressable>
                        <Pressable
                          style={[styles.button, styles.eventPickerModalActionButton]}
                          onPress={confirmLunchDatePicker}
                        >
                          <Text style={styles.buttonText}>Fertig</Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                ) : null}

                <Text style={styles.settingsHint}>
                  Einzelne Gerichte kannst du später unter „Mein Menü“ bearbeiten und auf andere Tage begrenzen.
                </Text>
                {lunchValidityEditor.error ? <Text style={styles.errorText}>{lunchValidityEditor.error}</Text> : null}
                <View style={styles.lunchValidityModalActions}>
                  {lunchValidityEditor.suggestionType === 'none' ? (
                    <Pressable
                      style={[styles.outlineButton, styles.lunchValidityModalAction]}
                      onPress={() => applyLunchValidityToDraft({ useOpeningHours: true })}
                    >
                      <Text style={styles.outlineButtonText}>Später festlegen</Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      style={[styles.outlineButton, styles.lunchValidityModalAction]}
                      onPress={closeLunchValidityEditor}
                    >
                      <Text style={styles.outlineButtonText}>Abbrechen</Text>
                    </Pressable>
                  )}
                  <Pressable
                    style={[styles.button, styles.lunchValidityModalAction]}
                    onPress={() => applyLunchValidityToDraft()}
                  >
                    <Text style={styles.buttonText}>
                      {lunchValidityEditor.saveAfterApply ? 'Übernehmen und speichern' : 'Übernehmen'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </Modal>

          <Modal
            visible={
              Platform.OS !== 'android' &&
              lunchDatePickerState.visible &&
              lunchDatePickerState.target === 'item'
            }
            transparent
            animationType="fade"
            onRequestClose={closeLunchDatePicker}
          >
            <View style={styles.eventPickerBackdrop}>
              <View style={styles.eventPickerModalCard}>
                <Text style={styles.eventPickerModalTitle}>
                  {lunchDatePickerState.field === 'fromDate' ? 'Von-Datum wählen' : 'Bis-Datum wählen'}
                </Text>
                {Platform.OS === 'web' ? (
                  <ScrollView style={styles.lunchValidityWebDateList}>
                    {lunchValidityDateOptions.map((option) => (
                      <Pressable
                        key={`lunch-validity-date-${option.key}`}
                        style={[
                          styles.specialClosurePickerRow,
                          toIsoDateText(lunchDatePickerState.value) === option.key &&
                            styles.specialClosurePickerRowActive
                        ]}
                        onPress={() => {
                          setLunchDatePickerValue(
                            lunchDatePickerState.target,
                            lunchDatePickerState.field,
                            parseLunchIsoDate(option.key)
                          );
                          closeLunchDatePicker();
                        }}
                      >
                        <Text
                          style={[
                            styles.specialClosurePickerRowText,
                            toIsoDateText(lunchDatePickerState.value) === option.key &&
                              styles.specialClosurePickerRowTextActive
                          ]}
                        >
                          {option.label}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                ) : (
                  <DateTimePicker
                    value={lunchDatePickerState.value}
                    mode="date"
                    display="spinner"
                    onChange={handleLunchDatePickerChange}
                    style={styles.eventPickerSpinner}
                  />
                )}
                {Platform.OS !== 'web' ? (
                  <View style={styles.eventPickerModalActions}>
                    <Pressable
                      style={[styles.outlineButton, styles.eventPickerModalActionButton]}
                      onPress={closeLunchDatePicker}
                    >
                      <Text style={styles.outlineButtonText}>Abbrechen</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.button, styles.eventPickerModalActionButton]}
                      onPress={confirmLunchDatePicker}
                    >
                      <Text style={styles.buttonText}>Fertig</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable style={styles.outlineButton} onPress={closeLunchDatePicker}>
                    <Text style={styles.outlineButtonText}>Abbrechen</Text>
                  </Pressable>
                )}
              </View>
            </View>
          </Modal>

          <Modal
            visible={Platform.OS === 'ios' && eventDateTimePickerState.visible}
            transparent
            animationType="fade"
            onRequestClose={closeEventDateTimePicker}
          >
            <View style={styles.eventPickerBackdrop}>
              <View style={styles.eventPickerModalCard}>
                <Text style={styles.eventPickerModalTitle}>
                  {eventDateTimePickerState.mode === 'date' ? 'Datum wählen' : 'Uhrzeit wählen'}
                </Text>
                <DateTimePicker
                  value={eventDateTimePickerState.value}
                  mode={eventDateTimePickerState.mode}
                  display="spinner"
                  is24Hour
                  minuteInterval={15}
                  onChange={handleEventDateTimePickerChange}
                  style={styles.eventPickerSpinner}
                />
                <View style={styles.eventPickerModalActions}>
                  <Pressable
                    style={[styles.outlineButton, styles.eventPickerModalActionButton]}
                    onPress={closeEventDateTimePicker}
                  >
                    <Text style={styles.outlineButtonText}>Abbrechen</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.button, styles.eventPickerModalActionButton]}
                    onPress={confirmEventDateTimePicker}
                  >
                    <Text style={styles.buttonText}>Fertig</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </Modal>

          {Platform.OS === 'android' && eventDateTimePickerState.visible ? (
            <DateTimePicker
              value={eventDateTimePickerState.value}
              mode={eventDateTimePickerState.mode}
              display="default"
              is24Hour
              minuteInterval={15}
              onChange={handleEventDateTimePickerChange}
            />
          ) : null}

          {Platform.OS === 'android' && lunchDatePickerState.visible ? (
            <DateTimePicker
              value={lunchDatePickerState.value}
              mode="date"
              display="default"
              onChange={handleLunchDatePickerChange}
            />
          ) : null}

          <Modal visible={supportOpen} transparent animationType="fade" onRequestClose={closeSupport}>
            <KeyboardAvoidingView
              style={styles.supportKeyboardView}
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
              <View
                style={[
                  styles.supportFullscreenBackdrop,
                  {
                    paddingTop: Math.max(insets.top, spacing.sm),
                    paddingBottom: Math.max(insets.bottom, spacing.sm)
                  }
                ]}
              >
                <View style={styles.supportChatModal}>
                  <View style={styles.supportChatHeader}>
                    <View style={styles.supportAssistantAvatar}>
                      <Ionicons name="sparkles" size={20} color={colors.accent} />
                    </View>
                    <View style={styles.supportHeaderTextWrap}>
                      <Text style={styles.supportHeaderTitle}>Nah&Fein Assistent</Text>
                      <View style={styles.supportOnlineRow}>
                        <View style={styles.supportOnlineDot} />
                        <Text style={styles.supportOnlineText}>Online</Text>
                      </View>
                    </View>
                    {supportMode !== 'start' ? (
                      <Pressable style={styles.supportHeaderBackButton} onPress={() => setSupportMode('start')}>
                        <Ionicons name="chevron-back" size={20} color={colors.muted} />
                      </Pressable>
                    ) : null}
                    <Pressable style={styles.guideCloseButton} onPress={closeSupport}>
                      <Ionicons name="close" size={18} color={colors.muted} />
                    </Pressable>
                  </View>

                  {supportMode === 'start' ? (
                    <View style={styles.supportStartContent}>
                      <View style={styles.supportGreetingBubble}>
                        <Text style={styles.supportGreetingTitle}>Hallo, wie kann ich dir heute helfen?</Text>
                        <Text style={styles.supportGreetingText}>
                          Der Assistent hilft dir schnell bei Menü, Angeboten, Mittagstisch und Profil.
                        </Text>
                      </View>
                      <Pressable style={styles.supportAssistantChoice} onPress={openSupportAssistant}>
                        <View style={styles.supportChoiceIcon}>
                          <Ionicons name="sparkles" size={21} color={colors.accent} />
                        </View>
                        <View style={styles.supportChoiceTextWrap}>
                          <Text style={styles.supportChoiceTitle}>Lass dir vom Assistenten helfen</Text>
                          <Text style={styles.supportChoiceText}>Schnelle Hilfe direkt in der App</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={20} color={colors.muted} />
                      </Pressable>
                      <Pressable style={styles.supportTeamChoice} onPress={openTeamSupport}>
                        <View style={styles.supportChoiceIcon}>
                          <Ionicons name="mail-outline" size={21} color={colors.ink} />
                        </View>
                        <View style={styles.supportChoiceTextWrap}>
                          <Text style={styles.supportChoiceTitle}>Dem Team schreiben</Text>
                          <Text style={styles.supportChoiceText}>Für persönliche oder technische Anliegen</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={20} color={colors.muted} />
                      </Pressable>
                    </View>
                  ) : null}

                  {supportMode === 'assistant' ? (
                    <View style={styles.supportAssistantContent}>
                      <ScrollView
                        ref={supportChatScrollRef}
                        style={styles.supportMessageScroll}
                        contentContainerStyle={styles.supportMessageScrollContent}
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                        keyboardDismissMode="on-drag"
                      >
                        <View style={[styles.supportBubble, styles.supportAssistantBubble]}>
                          <View style={styles.supportBubbleTitleRow}>
                            <Ionicons name="sparkles" size={15} color={colors.accent} />
                            <Text style={styles.supportBubbleTitle}>Nah&Fein Assistent</Text>
                          </View>
                          <Text style={styles.supportBubbleText}>Hallo, wie kann ich dir heute helfen?</Text>
                        </View>
                        <View style={styles.supportQuickActionWrap}>
                          {supportQuickActions.map((action) => (
                            <Pressable
                              key={action.label}
                              style={[styles.supportQuickAction, styles[`supportQuickAction${action.color[0].toUpperCase()}${action.color.slice(1)}`]]}
                              onPress={() => handleSupportChatSend(action.message)}
                              disabled={supportChatSending}
                            >
                              <Ionicons name={action.icon} size={15} color={colors.ink} />
                              <Text style={styles.supportQuickActionText}>{action.label}</Text>
                            </Pressable>
                          ))}
                        </View>
                        {supportChatLoading ? <Text style={styles.supportChatMuted}>Unterhaltung wird geladen ...</Text> : null}
                        {supportChatMessages.map((message) => (
                          <View
                            key={message.id}
                            style={[
                              styles.supportBubble,
                              message.role === 'user' ? styles.supportUserBubble : styles.supportAssistantBubble
                            ]}
                          >
                            {message.role === 'assistant' ? (
                              <View style={styles.supportBubbleTitleRow}>
                                <Ionicons name="sparkles" size={15} color={colors.accent} />
                                <Text style={styles.supportBubbleTitle}>{message.title || 'Nah&Fein Assistent'}</Text>
                              </View>
                            ) : null}
                            <Text style={[styles.supportBubbleText, message.role === 'user' && styles.supportUserBubbleText]}>
                              {message.content}
                            </Text>
                            {Array.isArray(message.steps) && message.steps.length ? (
                              <View style={styles.supportStepsCard}>
                                {message.steps.map((step, index) => (
                                  <View key={`${message.id}-${index}`} style={styles.supportStepRow}>
                                    <Text style={styles.supportStepNumber}>{index + 1}</Text>
                                    <Text style={styles.supportStepText}>{step}</Text>
                                  </View>
                                ))}
                              </View>
                            ) : null}
                            {message.action ? (
                              <Pressable
                                style={styles.supportActionButton}
                                onPress={() => handleSupportChatAction(message.action)}
                              >
                                <Text style={styles.supportActionButtonText}>{message.action.label}</Text>
                                <Ionicons name="arrow-forward" size={16} color={colors.white} />
                              </Pressable>
                            ) : null}
                            {message.handoffSuggested ? (
                              <Pressable style={styles.supportTeamInlineButton} onPress={openTeamSupport}>
                                <Text style={styles.supportTeamInlineText}>Dem Team schreiben</Text>
                              </Pressable>
                            ) : null}
                          </View>
                        ))}
                        {supportChatError ? (
                          <View style={styles.supportErrorRow}>
                            <Text style={styles.errorText}>{supportChatError}</Text>
                            <Pressable onPress={() => handleSupportChatSend(supportChatInput)}>
                              <Text style={styles.supportRetryText}>Erneut versuchen</Text>
                            </Pressable>
                          </View>
                        ) : null}
                      </ScrollView>
                      <View style={styles.supportInputArea}>
                        <View style={styles.supportInputPill}>
                          <TextInput
                            value={supportChatInput}
                            onChangeText={setSupportChatInput}
                            placeholder="Nachricht schreiben ..."
                            multiline
                            maxLength={2000}
                            returnKeyType="done"
                            blurOnSubmit
                            onSubmitEditing={Keyboard.dismiss}
                            style={styles.supportChatInput}
                          />
                          <Pressable
                            style={[styles.supportSendButton, (!supportChatInput.trim() || supportChatSending) && styles.supportSendButtonDisabled]}
                            disabled={!supportChatInput.trim() || supportChatSending}
                            onPress={() => handleSupportChatSend()}
                          >
                            <Ionicons name="arrow-up" size={19} color={colors.white} />
                          </Pressable>
                        </View>
                      </View>
                    </View>
                  ) : null}

                  {supportMode === 'team' ? (
                    <ScrollView
                      style={styles.supportTeamScroll}
                      contentContainerStyle={styles.supportTeamContent}
                      showsVerticalScrollIndicator={false}
                      keyboardShouldPersistTaps="handled"
                      keyboardDismissMode="on-drag"
                    >
                      <Text style={styles.supportTeamTitle}>Nachricht an unser Team</Text>
                      <Text style={styles.supportTeamIntro}>
                        Beschreibe kurz, was nicht funktioniert oder was du brauchst. Restaurantdaten werden automatisch mitgesendet.
                      </Text>
                      <TextInput
                        value={guideSupportMessage}
                        onChangeText={setGuideSupportMessage}
                        placeholder="Beschreibe kurz dein Problem oder deine Frage."
                        multiline
                        maxLength={4000}
                        returnKeyType="done"
                        blurOnSubmit
                        onSubmitEditing={Keyboard.dismiss}
                        style={[styles.input, styles.textArea, styles.supportTeamInput]}
                      />
                      {guideSupportError ? <Text style={styles.errorText}>{guideSupportError}</Text> : null}
                      {guideSupportStatus ? <Text style={styles.status}>{guideSupportStatus}</Text> : null}
                      <Pressable
                        style={[styles.button, styles.supportTeamSendButton]}
                        onPress={handleGuideSupportSubmit}
                        disabled={guideSupportSending || restaurantLoading}
                      >
                        <Text style={styles.buttonText}>{guideSupportSending || restaurantLoading ? 'Bitte warten...' : 'Nachricht senden'}</Text>
                      </Pressable>
                    </ScrollView>
                  ) : null}
                </View>
              </View>
            </KeyboardAvoidingView>
          </Modal>

          <Modal
            visible={onboardingAssistantOpen}
            transparent
            animationType="fade"
            onRequestClose={closeOnboardingAssistant}
          >
            <View
              style={[
                styles.modalBackdrop,
                isCompactLayout && styles.modalBackdropCompact,
                isSmallPhone && styles.modalBackdropSmallPhone
              ]}
            >
              <View
                style={[
                  styles.modalCard,
                  styles.onboardingModalCard,
                  isCompactLayout && styles.modalCardCompact,
                  isSmallPhone && styles.modalCardSmallPhone,
                  settingsModalSizeStyle,
                  modalTopOffsetStyle
                ]}
              >
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={[
                    styles.modalScrollContent,
                    isSmallPhone && styles.modalScrollContentSmallPhone,
                    { paddingBottom: Math.max(insets.bottom, spacing.sm) }
                  ]}
                  keyboardShouldPersistTaps="handled"
                >
                  <Text style={styles.onboardingEyebrow}>Start hier</Text>
                  <Text style={[styles.cardTitle, compactCardTitleStyle, styles.titleGuideTitleReset]}>
                    {onboardingAssistantTitle}
                  </Text>
                  <Text style={[styles.onboardingIntro, isSmallPhone && styles.onboardingIntroSmallPhone]}>
                    {onboardingAssistantIntro}
                  </Text>
                  <View style={styles.onboardingStepList}>
                    {restaurantOnboardingSteps.map((step, index) => (
                      <View key={`onboarding-step-${index}`} style={styles.onboardingStepCard}>
                        <View style={styles.onboardingStepBadge}>
                          <Text style={styles.onboardingStepBadgeText}>{index + 1}</Text>
                        </View>
                        <View style={styles.onboardingStepContent}>
                          <Text style={styles.onboardingStepTitle}>{step.title}</Text>
                          <Text style={styles.onboardingStepText}>{step.text}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                  <View style={styles.onboardingActions}>
                    <Pressable
                      style={[styles.button, isSmallPhone && styles.buttonCompactSmallPhone]}
                      onPress={handleOnboardingOpenSettings}
                    >
                      <Text style={styles.buttonText}>Einstellungen prüfen</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.outlineButton, isSmallPhone && styles.buttonCompactSmallPhone]}
                      onPress={handleOnboardingStartKi}
                    >
                      <Text style={styles.outlineButtonText}>{onboardingAssistantActionLabel}</Text>
                    </Pressable>
                    <Pressable style={styles.onboardingLaterButton} onPress={closeOnboardingAssistant}>
                      <Text style={styles.onboardingLaterButtonText}>Später</Text>
                    </Pressable>
                  </View>
                </ScrollView>
              </View>
            </View>
          </Modal>

          {!restaurant ? (
            <>
              {authMode === 'login' ? (
                <View style={[styles.card, compactCardStyle]}>
                  <Text style={[styles.cardTitle, compactCardTitleStyle]}>Partner-Login</Text>
                  <Text style={[styles.helperText, compactHelperTextStyle]}>
                    Nach der Freischaltung kannst du den Partner-Login nutzen.
                  </Text>
                  <TextInput
                    {...authInputProps}
                    placeholder="E-Mail"
                    value={loginEmail}
                    onChangeText={setLoginEmail}
                    keyboardType="email-address"
                    style={[styles.input, styles.authInput, compactInputStyle]}
                  />
                  {renderAuthPasswordField({
                    fieldKey: 'login',
                    placeholder: 'Passwort',
                    value: loginPassword,
                    onChangeText: setLoginPassword
                  })}
                  <ToggleSwitch
                    label="Eingeloggt bleiben"
                    value={rememberMe}
                    onPress={() => setRememberMe((prev) => !prev)}
                    compact
                    disabled={restaurantLoading}
                  />
                  <Pressable style={[styles.button, isSmallPhone && styles.buttonCompactSmallPhone]} onPress={handleLogin}>
                    <Text style={styles.buttonText}>
                      {restaurantLoading ? 'Bitte warten...' : 'Einloggen'}
                    </Text>
                  </Pressable>
                  <Pressable onPress={openPasswordReset} style={styles.authSwitchLink}>
                    <Text style={styles.authSwitchText}>Passwort vergessen?</Text>
                  </Pressable>
                  <Pressable onPress={() => setAuthMode('register')} style={styles.authSwitchLink}>
                    <Text style={styles.authSwitchText}>Kein Konto? Als Partner registrieren</Text>
                  </Pressable>
                  {restaurantError ? <Text style={styles.errorText}>{restaurantError}</Text> : null}
                </View>
              ) : authMode === 'resetPassword' ? (
                <View style={[styles.card, compactCardStyle]}>
                  <Text style={[styles.cardTitle, compactCardTitleStyle]}>Passwort zurücksetzen</Text>
                  <Text style={[styles.helperText, compactHelperTextStyle]}>
                    Gib deine Partner-E-Mail ein. Danach bekommst du einen 6-stelligen Code per E-Mail.
                  </Text>
                  <TextInput
                    {...authInputProps}
                    placeholder="E-Mail"
                    value={resetEmail}
                    onChangeText={setResetEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    style={[styles.input, styles.authInput, compactInputStyle]}
                  />
                  <Pressable
                    style={[styles.outlineButton, isSmallPhone && styles.buttonCompactSmallPhone]}
                    onPress={handleRequestPasswordReset}
                    disabled={restaurantLoading}
                  >
                    <Text style={styles.outlineButtonText}>
                      {restaurantLoading ? 'Bitte warten...' : 'Code senden'}
                    </Text>
                  </Pressable>
                  {resetCodeSent ? (
                    <>
                      <TextInput
                        {...authInputProps}
                        placeholder="6-stelliger Code"
                        value={resetCode}
                        onChangeText={setResetCode}
                        keyboardType="number-pad"
                        maxLength={6}
                        style={[styles.input, styles.authInput, compactInputStyle]}
                      />
                      {renderAuthPasswordField({
                        fieldKey: 'resetNew',
                        placeholder: 'Neues Passwort',
                        value: resetPassword,
                        onChangeText: setResetPassword
                      })}
                      {renderAuthPasswordField({
                        fieldKey: 'resetNewConfirm',
                        placeholder: 'Neues Passwort wiederholen',
                        value: resetPasswordConfirm,
                        onChangeText: setResetPasswordConfirm
                      })}
                      <Pressable
                        style={[styles.button, isSmallPhone && styles.buttonCompactSmallPhone]}
                        onPress={handleConfirmPasswordReset}
                        disabled={restaurantLoading}
                      >
                        <Text style={styles.buttonText}>
                          {restaurantLoading ? 'Bitte warten...' : 'Passwort speichern'}
                        </Text>
                      </Pressable>
                    </>
                  ) : null}
                  <Pressable onPress={() => setAuthMode('login')} style={styles.authSwitchLink}>
                    <Text style={styles.authSwitchText}>Zurück zum Login</Text>
                  </Pressable>
                  {restaurantError ? <Text style={styles.errorText}>{restaurantError}</Text> : null}
                </View>
              ) : (
                <View style={[styles.card, compactCardStyle]}>
                  <Text style={[styles.cardTitle, compactCardTitleStyle]}>Partner registrieren</Text>
                  <Text style={[styles.helperText, compactHelperTextStyle]}>
                    Alle Felder sind Pflicht. Optional kannst du ein Logo hochladen.
                  </Text>
                  <TextInput
                    {...authInputProps}
                    placeholder="Partner-Name"
                    value={registerName}
                    onChangeText={setRegisterName}
                    style={[styles.input, styles.authInput, compactInputStyle]}
                  />
                  <TextInput
                    {...authInputProps}
                    placeholder="E-Mail"
                    value={registerEmail}
                    onChangeText={setRegisterEmail}
                    keyboardType="email-address"
                    style={[styles.input, styles.authInput, compactInputStyle]}
                  />
                  {renderAuthPasswordField({
                    fieldKey: 'register',
                    placeholder: 'Passwort',
                    value: registerPassword,
                    onChangeText: setRegisterPassword
                  })}
                  <TextInput
                    {...authInputProps}
                    placeholder="Telefonnummer"
                    value={registerPhone}
                    onChangeText={setRegisterPhone}
                    keyboardType="phone-pad"
                    style={[styles.input, styles.authInput, compactInputStyle]}
                  />
                  <TextInput
                    {...authInputProps}
                    placeholder="Straße"
                    value={registerAddress}
                    onChangeText={setRegisterAddress}
                    style={[styles.input, styles.authInput, compactInputStyle]}
                  />
                  {registerStreetLookupLoading ? (
                    <Text style={styles.registerLookupHint}>Straßenvorschläge werden geladen...</Text>
                  ) : null}
                  {registerStreetSuggestions.length ? (
                    <View style={styles.citySuggestionsCard}>
                      {registerStreetSuggestions.map((entry) => (
                        <Pressable
                          key={entry.id}
                          style={styles.citySuggestionRow}
                          onPress={() => handleSelectRegisterStreet(entry)}
                        >
                          <Text style={styles.citySuggestionTitle}>{entry.label}</Text>
                          {entry.meta ? (
                            <Text style={styles.citySuggestionMeta}>{entry.meta}</Text>
                          ) : null}
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                  {registerStreetLookupError ? (
                    <Text style={styles.registerLookupError}>{registerStreetLookupError}</Text>
                  ) : null}
                  <TextInput
                    {...authInputProps}
                    placeholder="Stadt"
                    value={registerCity}
                    onChangeText={setRegisterCity}
                    style={[styles.input, styles.authInput, compactInputStyle]}
                  />
                  {registerCityLookupLoading ? (
                    <Text style={styles.registerLookupHint}>Stadtvorschläge werden geladen...</Text>
                  ) : null}
                  {registerCitySuggestions.length ? (
                    <View style={styles.citySuggestionsCard}>
                      {registerCitySuggestions.map((entry) => (
                        <Pressable
                          key={entry.id}
                          style={styles.citySuggestionRow}
                          onPress={() => handleSelectRegisterCity(entry)}
                        >
                          <Text style={styles.citySuggestionTitle}>{entry.label}</Text>
                          {entry.postcode ? (
                            <Text style={styles.citySuggestionMeta}>PLZ {entry.postcode}</Text>
                          ) : null}
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                  {registerCityLookupError ? (
                    <Text style={styles.registerLookupError}>{registerCityLookupError}</Text>
                  ) : null}
	                  <TextInput
	                    {...authInputProps}
	                    placeholder="Postleitzahl"
	                    value={registerPostal}
	                    onChangeText={setRegisterPostal}
	                    keyboardType="number-pad"
	                    maxLength={5}
	                    style={[styles.input, styles.authInput, compactInputStyle]}
	                  />
                  {eventsEnabled || cateringEnabled ? (
	                    <View style={styles.registerMenuUploadCard}>
	                      <Text style={styles.settingsSectionLabel}>Was bietest du an?</Text>
	                      <Text style={styles.settingsHint}>
                        Wähle Essen, Events, Catering oder eine Kombination. Du kannst das später ändern.
	                      </Text>
	                      <View style={styles.providerScopeRow}>
                        {providerScopeOptions
                          .filter(
                            (option) =>
                              option.key === 'food' ||
                              (option.key === 'events' && eventsEnabled) ||
                              (option.key === 'catering' && cateringEnabled)
                          )
                          .map((option) => {
	                          const active = normalizeProviderScopesForEdit(registerProviderScopes).includes(option.key);
	                          return (
	                            <Pressable
	                              key={`register-provider-${option.key}`}
	                              onPress={() =>
	                                setRegisterProviderScopes((prev) =>
	                                  toggleProviderScopeValue(prev, option.key)
	                                )
	                              }
	                              style={[styles.providerScopeChip, active && styles.providerScopeChipActive]}
	                            >
	                              <Text
	                                style={[
	                                  styles.providerScopeChipTitle,
	                                  active && styles.providerScopeChipTitleActive
	                                ]}
	                              >
	                                {option.title}
	                              </Text>
	                              <Text
	                                style={[
	                                  styles.providerScopeChipText,
	                                  active && styles.providerScopeChipTextActive
	                                ]}
	                              >
	                                {option.text}
	                              </Text>
	                            </Pressable>
	                          );
	                        })}
	                      </View>
	                    </View>
	                  ) : null}
	                  {registerLogoUri ? (
	                    <Image source={{ uri: registerLogoUri }} style={styles.registerLogoPreview} />
	                  ) : null}
                  <Pressable style={styles.imageButton} onPress={handlePickRegisterLogo}>
                    <Ionicons name="image-outline" size={18} color={colors.ink} />
                    <Text style={styles.imageButtonText}>Logo hochladen (optional)</Text>
                  </Pressable>
	                  <View style={styles.registerConsentSection}>
                    <ToggleSwitch
                      label="AGB akzeptieren"
                      value={registerTermsAccepted}
                      onPress={() => setRegisterTermsAccepted((prev) => !prev)}
                      compact
                      disabled={restaurantLoading}
                    />
                    <ToggleSwitch
                      label="Datenschutz akzeptieren"
                      value={registerPrivacyAccepted}
                      onPress={() => setRegisterPrivacyAccepted((prev) => !prev)}
                      compact
                      disabled={restaurantLoading}
                    />
                    <View style={styles.registerLegalLinksRow}>
                      <Pressable
                        onPress={() => handleOpenExternalLink(AGB_URL)}
                        style={styles.registerLegalLinkButton}
                      >
                        <Text style={styles.registerLegalLinkText}>AGB lesen</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => handleOpenExternalLink(DATENSCHUTZ_URL)}
                        style={styles.registerLegalLinkButton}
                      >
                        <Text style={styles.registerLegalLinkText}>Datenschutz lesen</Text>
                      </Pressable>
                    </View>
                  </View>
                  <Pressable style={[styles.button, isSmallPhone && styles.buttonCompactSmallPhone]} onPress={handleRegister}>
                    <Text style={styles.buttonText}>
                      {restaurantLoading ? 'Bitte warten...' : 'Registrierung senden'}
                    </Text>
                  </Pressable>
                  <Pressable onPress={() => setAuthMode('login')} style={styles.authSwitchLink}>
                    <Text style={styles.authSwitchText}>Schon registriert? Zum Partner-Login</Text>
                  </Pressable>
                  {restaurantError ? <Text style={styles.errorText}>{restaurantError}</Text> : null}
                </View>
              )}

              {status ? <Text style={styles.status}>{status}</Text> : null}
            </>
          ) : isOnboardingMode ? (
            renderRestaurantOnboarding()
          ) : (
            <>
              {!activePanel && status ? <Text style={styles.status}>{status}</Text> : null}

              {!activePanel ? (
                <View
                  style={[
                    styles.dashboardGrid,
                    isSmallPhone && styles.dashboardGridSmallPhone
                  ]}
                >
	                  {dashboardPanelItems.map((panel) => {
                      const badgeCountByPanel = {
                        offers: activeOffersCount,
                        reviews: unreadReviewsCount,
                        services: activeEventsCount + activeCateringOffersCount,
                        requests: pendingOrdersCount + pendingReservationsCount
                      };
                      const hasBadge = Object.prototype.hasOwnProperty.call(badgeCountByPanel, panel.key);
                      const panelBadgeCount = badgeCountByPanel[panel.key] || 0;
                      return (
                        <Pressable
                          key={panel.key}
                          style={({ pressed }) => [
                            styles.dashboardTilePressable,
                            panel.disabled && styles.dashboardTileDisabled,
                            pressed && styles.dashboardTilePressed
                          ]}
                          onPress={() => openPanel(panel.key)}
                          accessibilityRole="button"
                        >
                          <LinearGradient
                            colors={panel.colors}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={[styles.dashboardTile, isSmallPhone && styles.dashboardTileSmallPhone]}
                          >
                            <View style={styles.dashboardTileHead}>
                              <View style={styles.dashboardTileIcon}>
                                <Ionicons name={panel.icon} size={24} color={colors.white} />
                              </View>
                              {hasBadge ? (
                                <View style={styles.dashboardTileBadge}>
                                  <Text style={styles.dashboardTileBadgeText}>{panelBadgeCount}</Text>
                                </View>
                              ) : (
                                <Ionicons name="chevron-forward" size={18} color={colors.white} />
                              )}
                            </View>
                            <View>
                              <Text style={[styles.dashboardTileTitle, isSmallPhone && styles.dashboardTileTitleSmallPhone]}>
                                {panel.title}
                              </Text>
                              <Text style={[styles.dashboardTileText, isSmallPhone && styles.dashboardTileTextSmallPhone]}>
                                {panel.key === 'myMenu' && hasExistingDigitalMenu
                                  ? 'Digitales Menü öffnen und bearbeiten'
                                  : panel.text}
                              </Text>
                            </View>
                          </LinearGradient>
                        </Pressable>
                      );
                    })}
                </View>
              ) : null}

              {activePanel === 'myMenu'
                ? (
                    <>
                    {menuWorkspace ? renderMenuWorkspaceHeader() : renderPanelScreenHeader('Mein Menü')}
                    <View
                      style={[
                        styles.card,
                        styles.panelScreenCard,
                        compactCardStyle,
                        isSmallPhone && styles.panelScreenCardSmallPhone
                      ]}
                    >
                    {restaurantError ? <Text style={styles.errorText}>{restaurantError}</Text> : null}
                    {status ? <Text style={styles.status}>{status}</Text> : null}
                    {!menuWorkspace ? renderMenuSelector() : null}
                    {(menuWorkspace === 'regular' || menuWorkspace === 'breakfast') ? (
                      <>
                      {renderMenuWorkspaceOverview(menuWorkspace)}
                      {menuKiToolsOpen ? (
                        <View
                          style={styles.menuWorkspaceContent}
                          onLayout={(event) => {
                            regularMenuContentYRef.current = event.nativeEvent.layout.y;
                          }}
                        >
                          <Pressable
                            style={[styles.menuWorkspaceCloseButton, styles.menuWorkspaceCloseButtonRegular]}
                            onPress={() => setMenuKiToolsOpen(false)}
                          >
                            <Ionicons name="chevron-up" size={17} color="#4A6095" />
                            <Text style={[styles.menuWorkspaceCloseButtonText, styles.menuWorkspaceCloseButtonTextRegular]}>
                              Speisekarte schließen
                            </Text>
                          </Pressable>
                          <Text style={[styles.menuPrimaryInfoText, isSmallPhone && styles.helperTextSmallPhone]}>
                            {menuPrimaryInfoText}
                          </Text>
                        <Pressable
                          style={[
                            styles.imageButton,
                            styles.digitalMenuPrimaryButton,
                            styles.menuLegacyActionHidden,
                            (digitalMenuLoading || menuPickerInProgress) && styles.digitalMenuPrimaryButtonDisabled
                          ]}
                          onPress={() => openMenuAddFlow('normal')}
                          disabled={digitalMenuLoading || menuPickerInProgress}
                        >
                          <Ionicons name="sparkles" size={18} color={colors.accent} />
                          <Text style={[styles.imageButtonText, styles.digitalMenuPrimaryButtonText]}>
                            {digitalMenuLoading
                              ? 'Bitte warten Sie. Ihre Karte wird nun erstellt.'
                              : 'Menü Bild laden'}
                          </Text>
                        </Pressable>
                        <Text style={[styles.helperText, compactHelperTextStyle]}>
                          Du kannst ein Foto machen oder bis zu 10 Bilder bzw. PDF-Dateien gemeinsam hochladen.
                        </Text>
                        <Pressable
                          style={[styles.outlineButton, styles.menuLegacyActionHidden]}
                          onPress={() => openMenuItemEditor(null)}
                          disabled={digitalMenuSaving}
                        >
                          <View style={styles.buttonIconRow}>
                            <Ionicons name="add-circle-outline" size={16} color={colors.accent} />
                            <Text style={styles.outlineButtonText}>Gericht manuell eintragen</Text>
                          </View>
                        </Pressable>
                        {digitalMenuDirty ? (
                          <Text style={styles.draftDirtyStatus}>Ungespeicherte Änderungen</Text>
                        ) : null}

                        {digitalMenuDraft.duplicatesRemoved > 0 ? (
                          <Text style={[styles.helperText, compactHelperTextStyle]}>
                            Bereinigt: {digitalMenuDraft.duplicatesRemoved} doppelte Einträge entfernt.
                          </Text>
                        ) : null}
                        {(digitalMenuDraft.warnings || []).map((warning, index) => (
                          <Text key={`${warning}-${index}`} style={[styles.helperText, compactHelperTextStyle]}>
                            Hinweis: {warning}
                          </Text>
                        ))}
                        {digitalMenuStatus ? <Text style={styles.status}>{digitalMenuStatus}</Text> : null}
                        {digitalMenuError ? <Text style={styles.errorText}>{digitalMenuError}</Text> : null}
                        {hasRecognizedDigitalMenuItems ? (
                          <>
                            <View style={styles.digitalDietFilterRow}>
                              {digitalDietFilterOptions.map((option) => (
                                <MealSlotChip
                                  key={`digital-diet-${option.key}`}
                                  label={option.label}
                                  active={digitalMenuDietFilter === option.key}
                                  compact
                                  tiny
                                  onPress={() => setDigitalMenuDietFilter(option.key)}
                                />
                              ))}
                            </View>
                            <View style={styles.digitalMenuList}>
                              {(menuWorkspace === 'breakfast' ? groupedBreakfastMenu : groupedDigitalMenu).map((group) => (
                                <View key={group.section} style={styles.digitalCategoryBlock}>
                                  <Text
                                    style={[
                                      styles.digitalCategoryTitle,
                                      styles[`digitalCategoryTitleTone${detectMenuSectionTone(group.section)}`]
                                    ]}
                                  >
                                    {group.section}
                                  </Text>
                                  {group.items.length ? (
                                    group.items.map((item) => (
                                      <Pressable
                                        key={item.id}
                                        style={styles.digitalListRow}
                                        onPress={() => openMenuItemEditor(item)}
                                        >
                                          <View style={styles.digitalListHead}>
                                            <View style={styles.digitalListNameWrap}>
                                              <Text style={styles.digitalListName}>{item.name}</Text>
                                              <MenuCategoryBadge category={item.category} />
                                              {isMenuItemMarkedAsOffer(item) ? (
                                              <View style={styles.menuOfferBadge}>
                                                <Ionicons name="pricetag" size={11} color={colors.white} />
                                                <Text style={styles.menuOfferBadgeText}>Angebot</Text>
                                              </View>
                                            ) : null}
                                          </View>
                                          <Text style={styles.digitalListPrice}>{toPriceText(item.priceText)} EUR</Text>
                                        </View>
                                        {item.description ? (
                                          <Text style={styles.digitalListDescription}>{item.description}</Text>
                                        ) : null}
                                        {Array.isArray(item.allergens) && item.allergens.length ? (
                                          <View style={styles.digitalItemAllergenWrap}>
                                            <Text style={styles.digitalItemAllergenLabel}>Allergene:</Text>
                                            <View style={styles.digitalItemAllergenRow}>
                                              {item.allergens.map((entry, index) => (
                                                <View key={`${item.id}-allergen-${index}`} style={styles.digitalAllergenChip}>
                                                  <Text style={styles.digitalAllergenChipText}>{entry}</Text>
                                                </View>
                                              ))}
                                            </View>
                                          </View>
                                        ) : null}
                                      </Pressable>
                                    ))
                                  ) : (
                                    <Text style={styles.digitalListEmpty}>Keine Gerichte.</Text>
                                  )}
                                </View>
                              ))}
                              {!(menuWorkspace === 'breakfast' ? groupedBreakfastMenu : groupedDigitalMenu).length ? (
                                <Text style={styles.digitalListEmpty}>{menuWorkspace === 'breakfast' ? 'Keine Frühstücksgerichte vorhanden.' : 'Keine Gerichte für den gewählten Filter.'}</Text>
                              ) : null}
                            </View>

                            <View style={styles.digitalAllergenCard}>
                              <Text style={[styles.sectionLabel, compactSectionLabelStyle]}>Allergene</Text>
                              <Text style={[styles.helperText, compactHelperTextStyle]}>
                                KI erkennt Allergene automatisch. Bei Unsicherheit hier manuell ergänzen oder korrigieren.
                              </Text>
                              <TextInput
                                value={digitalMenuAllergensText}
                                onChangeText={handleDigitalAllergensChange}
                                placeholder="z. B. Gluten, Milch, Eier (je Zeile ein Eintrag)"
                                style={[
                                  styles.input,
                                  compactInputStyle,
                                  styles.textArea,
                                  compactTextAreaStyle,
                                  styles.digitalAllergenInput
                                ]}
                                multiline
                              />
                              {digitalMenuDraft.allergens?.length ? (
                                <View style={styles.digitalAllergenChipRow}>
                                  {digitalMenuDraft.allergens.map((entry, index) => (
                                    <View key={`${entry}-${index}`} style={styles.digitalAllergenChip}>
                                      <Text style={styles.digitalAllergenChipText}>{entry}</Text>
                                    </View>
                                  ))}
                                </View>
                              ) : (
                                <Text style={[styles.helperText, compactHelperTextStyle]}>
                                  Noch keine Allergene hinterlegt.
                                </Text>
                              )}
                            </View>

                            <View style={[styles.digitalGlobalActions, styles.menuLegacyActionHidden]}>
                              <View
                                style={[
                                  styles.digitalGlobalActionsRow,
                                  isCompactLayout && styles.digitalGlobalActionsRowCompact,
                                  isSmallPhone && styles.digitalGlobalActionsRowSmallPhone
                                ]}
                              >
                                <Pressable
                                  style={[
                                    styles.digitalActionButton,
                                    isCompactLayout && styles.digitalActionButtonCompact,
                                    styles.digitalActionButtonSave,
                                    digitalMenuSaving && styles.digitalActionButtonDisabled
                                  ]}
                                  onPress={handleSaveDigitalMenu}
                                  disabled={digitalMenuSaving}
                                >
                                  <View style={[styles.buttonIconRow, isCompactLayout && styles.buttonIconRowCompact]}>
                                    <Ionicons name="save-outline" size={isCompactLayout ? 14 : 15} color={colors.white} />
                                    <Text
                                      numberOfLines={2}
                                      style={[
                                        styles.digitalActionButtonText,
                                        isCompactLayout && styles.digitalActionButtonTextCompact
                                      ]}
                                    >
                                      {digitalMenuSaving
                                        ? isCompactLayout
                                          ? 'Warten...'
                                          : 'Bitte warten...'
                                        : 'Speichern'}
                                    </Text>
                                  </View>
                                </Pressable>
                                <Pressable
                                  style={[
                                    styles.digitalActionButton,
                                    isCompactLayout && styles.digitalActionButtonCompact,
                                    styles.digitalActionButtonDelete,
                                    digitalMenuSaving && styles.digitalActionButtonDisabled
                                  ]}
                                  onPress={() => confirmClearDigitalMenu('normal')}
                                  disabled={digitalMenuSaving}
                                >
                                  <View style={[styles.buttonIconRow, isCompactLayout && styles.buttonIconRowCompact]}>
                                    <Ionicons name="trash-outline" size={isCompactLayout ? 14 : 15} color={colors.white} />
                                    <Text
                                      numberOfLines={2}
                                      style={[
                                        styles.digitalActionButtonText,
                                        isCompactLayout && styles.digitalActionButtonTextCompact
                                      ]}
                                    >
                                      {digitalMenuSaving
                                        ? isCompactLayout
                                          ? 'Warten...'
                                          : 'Bitte warten...'
                                        : 'Löschen'}
                                    </Text>
                                  </View>
                                </Pressable>
                              </View>
                            </View>
                            {digitalMenuDraft.updatedAt ? (
                              <Text style={[styles.helperText, compactHelperTextStyle]}>
                                Zuletzt gespeichert:{' '}
                                {new Date(digitalMenuDraft.updatedAt).toLocaleString('de-DE', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </Text>
                            ) : null}
                            {digitalMenuDraft.items?.length ? (
                              <Pressable style={styles.menuDeleteTextLink} onPress={() => setMenuDeleteConfirmKind({ type: 'card', kind: 'normal' })}>
                                <Text style={styles.menuDeleteTextLinkText}>Diese Karte löschen</Text>
                              </Pressable>
                            ) : null}
                          </>
                        ) : null}
                        </View>
                      ) : null}

                    </>
                    ) : null}

                    {menuWorkspace === 'lunch' && !isOnboardingMode ? (
                      <>
                      {renderMenuWorkspaceOverview('lunch')}
                        {lunchMenuToolsOpen ? (
                          <View
                            style={styles.menuWorkspaceContent}
                            onLayout={(event) => {
                              lunchMenuContentYRef.current = event.nativeEvent.layout.y;
                            }}
                          >
                            <Pressable
                              style={[styles.menuWorkspaceCloseButton, styles.menuWorkspaceCloseButtonLunch]}
                              onPress={() => setLunchMenuToolsOpen(false)}
                            >
                              <Ionicons name="chevron-up" size={17} color="#3E8056" />
                              <Text style={[styles.menuWorkspaceCloseButtonText, styles.menuWorkspaceCloseButtonTextLunch]}>
                                Mittagstisch schließen
                              </Text>
                            </Pressable>
                            {uploadedLunchMenuFiles.length ? (
                              <View style={styles.menuFileList}>
                                <Text style={styles.menuCurrentFileText}>Hochgeladene Mittagskarte</Text>
                                {uploadedLunchMenuFiles.map((entry, index) => (
                                  <View key={entry.id || `${entry.url}-${index}`} style={styles.menuFileRow}>
                                    <Text style={styles.menuFileName} numberOfLines={1}>
                                      {entry.name || `mittagskarte-${index + 1}`}
                                    </Text>
                                    <Pressable style={styles.menuFileShowButton} onPress={() => handleOpenMenu(entry)}>
                                      <Text style={styles.menuFileShowButtonText}>Anzeigen</Text>
                                    </Pressable>
                                  </View>
                                ))}
                              </View>
                            ) : null}
                            <Text style={[styles.menuPrimaryInfoText, isSmallPhone && styles.helperTextSmallPhone]}>
                              Lade Bilder oder PDFs mit KI hoch oder trage Mittagsgerichte manuell ein. Weise danach jedem
                              Gericht die passenden Tage zu.
                            </Text>
                            <Pressable
                              style={[
                                styles.imageButton,
                                styles.digitalMenuPrimaryButton,
                                styles.menuLegacyActionHidden,
                                (lunchMenuLoading || menuPickerInProgress) && styles.digitalMenuPrimaryButtonDisabled
                              ]}
                              onPress={() => handleGenerateDigitalMenu('lunch')}
                              disabled={lunchMenuLoading || menuPickerInProgress}
                            >
                              <Ionicons name="sparkles" size={18} color={colors.accent} />
                              <Text style={[styles.imageButtonText, styles.digitalMenuPrimaryButtonText]}>
                                {lunchMenuLoading
                                  ? 'Bitte warten Sie. Ihre Karte wird nun erstellt.'
                                  : 'Mittagstisch mit KI erstellen'}
                              </Text>
                            </Pressable>
                            <Pressable
                              style={[styles.outlineButton, styles.menuLegacyActionHidden, lunchMenuSaving && styles.buttonDisabled]}
                              onPress={() => openMenuItemEditor(null, 'lunch')}
                              disabled={lunchMenuSaving}
                            >
                              <View style={styles.buttonIconRow}>
                                <Ionicons name="add-circle-outline" size={16} color={colors.accent} />
                                <Text style={styles.outlineButtonText}>Mittagsgericht manuell eintragen</Text>
                              </View>
                            </Pressable>
                            {lunchMenuDirty ? <Text style={styles.draftDirtyStatus}>Ungespeicherte Änderungen</Text> : null}
                            {lunchMenuDraft.duplicatesRemoved > 0 ? (
                              <Text style={[styles.helperText, compactHelperTextStyle]}>
                                Bereinigt: {lunchMenuDraft.duplicatesRemoved} doppelte Einträge entfernt.
                              </Text>
                            ) : null}
                            {(lunchMenuDraft.warnings || []).map((warning, index) => (
                              <Text
                                key={`lunch-warning-${index}`}
                                style={[styles.helperText, compactHelperTextStyle]}
                              >
                                Hinweis: {warning}
                              </Text>
                            ))}
                            {lunchMenuStatus ? <Text style={styles.status}>{lunchMenuStatus}</Text> : null}
                            {lunchMenuError ? <Text style={styles.errorText}>{lunchMenuError}</Text> : null}

                            {hasRecognizedLunchMenuItems ? (
                              <>
                                <View style={styles.lunchValidityCard}>
                                  <View style={styles.lunchValidityHeaderRow}>
                                    <View style={styles.lunchValidityHeaderText}>
                                      <Text style={styles.lunchValidityTitle}>
                                        Zeitraum der Mittagstisch-Karte
                                      </Text>
                                      <Text
                                        style={[
                                          styles.lunchValiditySummary,
                                          lunchValiditySummary.pendingCount > 0 &&
                                            styles.lunchValiditySummaryPending
                                        ]}
                                      >
                                        {lunchValiditySummary.text}
                                      </Text>
                                    </View>
                                    <Pressable
                                      style={styles.lunchValidityChangeButton}
                                      onPress={() => openLunchValidityEditor('all', lunchMenuDraft, false)}
                                    >
                                      <Text style={styles.lunchValidityChangeButtonText}>
                                        {lunchValiditySummary.pendingCount > 0
                                          ? 'Datum festlegen'
                                          : 'Zeitraum ändern'}
                                      </Text>
                                    </Pressable>
                                  </View>
                                  <Text style={[styles.helperText, compactHelperTextStyle]}>
                                    Einzelne Gerichte kannst du durch Antippen unabhängig bearbeiten.
                                  </Text>
                                </View>
                                <View style={styles.digitalDietFilterRow}>
                                  {digitalDietFilterOptions.map((option) => (
                                    <MealSlotChip
                                      key={`lunch-diet-${option.key}`}
                                      label={option.label}
                                      active={lunchMenuDietFilter === option.key}
                                      compact
                                      tiny
                                      onPress={() => setLunchMenuDietFilter(option.key)}
                                    />
                                  ))}
                                </View>
                                <View style={styles.digitalMenuList}>
                                  {groupedLunchMenu.map((group) => (
                                    <View key={`lunch-group-${group.section}`} style={styles.digitalCategoryBlock}>
                                      <Text
                                        style={[
                                          styles.digitalCategoryTitle,
                                          styles[`digitalCategoryTitleTone${detectMenuSectionTone(group.section)}`]
                                        ]}
                                      >
                                        {group.section}
                                      </Text>
                                      {group.items.length ? (
                                        group.items.map((item) => (
                                          <Pressable
                                            key={item.id}
                                            style={styles.digitalListRow}
                                            onPress={() => openMenuItemEditor(item, 'lunch')}
                                            >
                                              <View style={styles.digitalListHead}>
                                                <View style={styles.digitalListNameWrap}>
                                                  <Text style={styles.digitalListName}>{item.name}</Text>
                                                  <MenuCategoryBadge category={item.category} />
                                                  {isMenuItemMarkedAsOffer(item) ? (
                                                  <View style={styles.menuOfferBadge}>
                                                    <Ionicons name="pricetag" size={11} color={colors.white} />
                                                    <Text style={styles.menuOfferBadgeText}>Angebot</Text>
                                                  </View>
                                                ) : null}
                                              </View>
                                              <Text style={styles.digitalListPrice}>{toPriceText(item.priceText)} EUR</Text>
                                            </View>
                                            {item.description ? (
                                              <Text style={styles.digitalListDescription}>{item.description}</Text>
                                            ) : null}
                                            <Text style={[styles.helperText, compactHelperTextStyle]}>
                                              {formatLunchScheduleText(item)}
                                            </Text>
                                            {item.active === false ? (
                                              <Text style={[styles.helperText, compactHelperTextStyle]}>
                                                Dieses Gericht ist aktuell deaktiviert.
                                              </Text>
                                            ) : null}
                                          </Pressable>
                                        ))
                                      ) : (
                                        <Text style={styles.digitalListEmpty}>Keine Mittagsgerichte.</Text>
                                      )}
                                    </View>
                                  ))}
                                  {!groupedLunchMenu.length ? (
                                    <Text style={styles.digitalListEmpty}>Keine Gerichte für den gewählten Filter.</Text>
                                  ) : null}
                                </View>

                                <View style={styles.digitalAllergenCard}>
                                  <Text style={[styles.sectionLabel, compactSectionLabelStyle]}>Allergene</Text>
                                  <Text style={[styles.helperText, compactHelperTextStyle]}>
                                    Allergene für die Mittagstisch-Karte bei Bedarf hier zentral ergänzen.
                                  </Text>
                                  <TextInput
                                    value={lunchMenuAllergensText}
                                    onChangeText={(value) => handleDigitalAllergensChange(value, 'lunch')}
                                    placeholder="z. B. Gluten, Milch, Eier (je Zeile ein Eintrag)"
                                    style={[
                                      styles.input,
                                      compactInputStyle,
                                      styles.textArea,
                                      compactTextAreaStyle,
                                      styles.digitalAllergenInput
                                    ]}
                                    multiline
                                  />
                                  {lunchMenuDraft.allergens?.length ? (
                                    <View style={styles.digitalAllergenChipRow}>
                                      {lunchMenuDraft.allergens.map((entry, index) => (
                                        <View key={`lunch-allergen-${index}`} style={styles.digitalAllergenChip}>
                                          <Text style={styles.digitalAllergenChipText}>{entry}</Text>
                                        </View>
                                      ))}
                                    </View>
                                  ) : (
                                    <Text style={[styles.helperText, compactHelperTextStyle]}>
                                      Noch keine Allergene hinterlegt.
                                    </Text>
                                  )}
                                </View>
                              </>
                            ) : null}

                            <View style={[styles.digitalGlobalActions, styles.menuLegacyActionHidden]}>
                              <View
                                style={[
                                  styles.digitalGlobalActionsRow,
                                  isCompactLayout && styles.digitalGlobalActionsRowCompact,
                                  isSmallPhone && styles.digitalGlobalActionsRowSmallPhone
                                ]}
                              >
                                <Pressable
                                  style={[
                                    styles.digitalActionButton,
                                    isCompactLayout && styles.digitalActionButtonCompact,
                                    styles.digitalActionButtonSave,
                                    lunchMenuSaving && styles.digitalActionButtonDisabled
                                  ]}
                                  onPress={() => handleSaveDigitalMenu('lunch')}
                                  disabled={lunchMenuSaving}
                                >
                                  <View style={[styles.buttonIconRow, isCompactLayout && styles.buttonIconRowCompact]}>
                                    <Ionicons name="save-outline" size={isCompactLayout ? 14 : 15} color={colors.white} />
                                    <Text
                                      numberOfLines={2}
                                      style={[
                                        styles.digitalActionButtonText,
                                        isCompactLayout && styles.digitalActionButtonTextCompact
                                      ]}
                                    >
                                      {lunchMenuSaving
                                        ? isCompactLayout
                                          ? 'Warten...'
                                          : 'Bitte warten...'
                                        : 'Speichern'}
                                    </Text>
                                  </View>
                                </Pressable>
                                <Pressable
                                  style={[
                                    styles.digitalActionButton,
                                    isCompactLayout && styles.digitalActionButtonCompact,
                                    styles.digitalActionButtonDelete,
                                    lunchMenuSaving && styles.digitalActionButtonDisabled
                                  ]}
                                  onPress={() => confirmClearDigitalMenu('lunch')}
                                  disabled={lunchMenuSaving}
                                >
                                  <View style={[styles.buttonIconRow, isCompactLayout && styles.buttonIconRowCompact]}>
                                    <Ionicons name="trash-outline" size={isCompactLayout ? 14 : 15} color={colors.white} />
                                    <Text
                                      numberOfLines={2}
                                      style={[
                                        styles.digitalActionButtonText,
                                        isCompactLayout && styles.digitalActionButtonTextCompact
                                      ]}
                                    >
                                      {lunchMenuSaving
                                        ? isCompactLayout
                                          ? 'Warten...'
                                          : 'Bitte warten...'
                                        : 'Löschen'}
                                    </Text>
                                  </View>
                                </Pressable>
                              </View>
                            </View>
                            {lunchMenuDraft.updatedAt ? (
                              <Text style={[styles.helperText, compactHelperTextStyle]}>
                                Zuletzt gespeichert:{' '}
                                {new Date(lunchMenuDraft.updatedAt).toLocaleString('de-DE', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </Text>
                            ) : null}
                            {lunchMenuDraft.items?.length ? (
                              <Pressable style={styles.menuDeleteTextLink} onPress={() => setMenuDeleteConfirmKind({ type: 'card', kind: 'lunch' })}>
                                <Text style={styles.menuDeleteTextLinkText}>Diese Karte löschen</Text>
                              </Pressable>
                            ) : null}
                          </View>
                        ) : null}
                    ) : null}

                    </>
                    ) : null}

                    {menuWorkspace === 'files' ? (
                    <View
                      style={[
                        styles.menuPathCard,
                        styles.menuPathCardSecondary,
                        isSmallPhone && styles.menuPathCardSmallPhone
                      ]}
                    >
                      <View style={styles.menuPathHeader}>
                        <View style={[styles.menuPathBadge, styles.menuPathBadgeSecondary]}>
                          <Text style={styles.menuPathBadgeText}>Alternative</Text>
                        </View>
                        <Text style={[styles.menuPathTitle, isSmallPhone && styles.menuPathTitleSmallPhone]}>
                          Menü als PDF / Bilder hochladen
                        </Text>
                      </View>
                      <Text style={[styles.menuPathDescription, isSmallPhone && styles.menuPathDescriptionSmallPhone]}>
                        Nur Fallback, wenn du dein Menü lieber direkt als Datei oder Fotos anzeigen möchtest.
                      </Text>
                      <Pressable
                        style={[
                          styles.menuToggleButton,
                          styles.menuToggleButtonPdf,
                          styles.menuToggleButtonSecondary,
                          isSmallPhone && styles.menuToggleButtonSmallPhone
                        ]}
                        onPress={() => setMenuPdfToolsOpen((prev) => !prev)}
                      >
                        <View style={styles.menuToggleButtonLeft}>
                          <Ionicons name="images-outline" size={18} color={colors.white} />
                          <Text style={styles.menuToggleButtonText}>Alternative: Menü als PDF / Bilder hochladen</Text>
                        </View>
                        <Ionicons
                          name={menuPdfToolsOpen ? 'chevron-up' : 'chevron-down'}
                          size={18}
                          color={colors.white}
                        />
                      </Pressable>

                      {menuPdfToolsOpen ? (
                        <>
                          <Text style={styles.menuCurrentFileText}>
                            Aktuelles Menü: {latestMenuFile?.name ? latestMenuFile.name : 'Kein Menü vorhanden'}
                          </Text>

                          <Pressable
                            style={[styles.imageButton, menuPickerInProgress && styles.menuPickerDisabled]}
                            onPress={handlePickMenu}
                            disabled={menuPickerInProgress}
                          >
                            <Ionicons name="cloud-upload" size={18} color={colors.ink} />
                            <Text style={styles.imageButtonText}>
                              {menuPickerInProgress
                                ? 'Dateiauswahl wird geöffnet...'
                                : restaurantLoading
                                ? 'Bitte warten...'
                                : 'Restaurant-Menü hochladen (Bild/PDF)'}
                            </Text>
                          </Pressable>
                          <Pressable
                            style={[
                              styles.outlineButton,
                              !hasUploadedMenu && styles.outlineButtonDisabled
                            ]}
                            onPress={handleDeleteMenu}
                            disabled={!hasUploadedMenu}
                          >
                            <Text
                              style={[
                                styles.outlineButtonText,
                                !hasUploadedMenu && styles.outlineButtonTextDisabled
                              ]}
                            >
                              Menü löschen
                            </Text>
                          </Pressable>

                          {!hasUploadedMenu ? (
                            <Text style={[styles.helperText, compactHelperTextStyle]}>Kein Menü vorhanden</Text>
                          ) : (
                            <View style={styles.menuFileList}>
                              {menuFiles.map((entry, index) => (
                                <View key={entry.id || `${entry.url}-${index}`} style={styles.menuFileRow}>
                                  <Text style={styles.menuFileName} numberOfLines={1}>
                                    {entry.name || 'menu'}
                                  </Text>
                                  <Pressable style={styles.menuFileShowButton} onPress={() => handleOpenMenu(entry)}>
                                    <Text style={styles.menuFileShowButtonText}>Anzeigen</Text>
                                  </Pressable>
                                </View>
                              ))}
                            </View>
                          )}
                        </>
                      ) : null}
                    </View>
                    ) : null}
                    </View>
                    </>
                )
                : null}

              <Modal visible={menuAddSheet.visible} transparent animationType="fade" onRequestClose={closeMenuAddFlow}>
                <View style={styles.menuFlowBackdrop}>
                  <View style={[styles.menuFlowSheet, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
                    <View style={styles.menuFlowHandle} />
                    {menuAddSheet.step === 'method' ? (
                      <>
                        <Text style={styles.menuFlowTitle}>Gericht hinzufügen</Text>
                        <Text style={styles.menuFlowSubtitle}>Wie möchtest du deine Karte pflegen?</Text>
                        <Pressable style={[styles.menuFlowOption, styles.menuFlowOptionFeatured]} onPress={() => chooseMenuAddMethod('ai')}>
                          <View style={styles.menuFlowOptionIcon}><Ionicons name="sparkles" size={22} color={colors.accent} /></View>
                          <View style={styles.menuFlowOptionCopy}><Text style={styles.menuFlowOptionTitle}>Mit KI aus Foto oder PDF</Text><Text style={styles.menuFlowOptionText}>Ganze Karte auf einmal erkennen</Text></View>
                          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                        </Pressable>
                        <Pressable style={styles.menuFlowOption} onPress={() => chooseMenuAddMethod('manual')}>
                          <View style={styles.menuFlowOptionIcon}><Ionicons name="create-outline" size={21} color="#4A6095" /></View>
                          <View style={styles.menuFlowOptionCopy}><Text style={styles.menuFlowOptionTitle}>Einzeln eintragen</Text><Text style={styles.menuFlowOptionText}>Name, Preis und Details selbst ausfüllen</Text></View>
                          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                        </Pressable>
                      </>
                    ) : null}
                    {menuAddSheet.step === 'replace' ? (
                      <>
                        <Text style={styles.menuFlowTitle}>Neue {menuAddSheet.kind === 'lunch' ? 'Mittagstisch-Karte' : 'Speisekarte'}</Text>
                        <Text style={styles.menuFlowSubtitle}>Es gibt bereits Gerichte. Was soll damit passieren?</Text>
                        <Pressable style={[styles.menuFlowOption, styles.menuFlowOptionDanger]} onPress={() => chooseMenuUploadMode('replace')}>
                          <View style={styles.menuFlowOptionIcon}><Ionicons name="refresh-outline" size={21} color={colors.accentWarm} /></View>
                          <View style={styles.menuFlowOptionCopy}><Text style={[styles.menuFlowOptionTitle, styles.menuFlowOptionTitleDanger]}>Alte Karte ersetzen</Text><Text style={styles.menuFlowOptionText}>Die bisherigen Gerichte werden entfernt.</Text></View>
                          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                        </Pressable>
                        <Pressable style={styles.menuFlowOption} onPress={() => chooseMenuUploadMode('append')}>
                          <View style={styles.menuFlowOptionIcon}><Ionicons name="add" size={24} color="#4A6095" /></View>
                          <View style={styles.menuFlowOptionCopy}><Text style={styles.menuFlowOptionTitle}>Gerichte ergänzen</Text><Text style={styles.menuFlowOptionText}>Neue Gerichte kommen zu den bisherigen dazu.</Text></View>
                          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                        </Pressable>
                      </>
                    ) : null}
                    {menuAddSheet.step === 'source' ? (
                      <>
                        <Pressable style={styles.menuFlowBack} onPress={() => setMenuAddSheet((current) => ({ ...current, step: current.importMode === 'replace' && !(getMenuDraftState(current.kind).draft.items || []).length ? 'method' : 'replace' }))}>
                          <Ionicons name="chevron-back" size={18} color={colors.accent} /><Text style={styles.menuFlowBackText}>Zurück</Text>
                        </Pressable>
                        <Text style={styles.menuFlowTitle}>Karte hochladen</Text>
                        <Text style={styles.menuFlowSubtitle}>Woher soll das Bild kommen?</Text>
                        {[
                          ['camera', 'camera-outline', 'Foto aufnehmen', 'Karte direkt fotografieren'],
                          ['gallery', 'images-outline', 'Aus Galerie', 'Vorhandene Fotos auswählen'],
                          ['file', 'document-text-outline', 'PDF oder Datei', 'Zum Beispiel eine Karte als PDF']
                        ].map(([source, icon, title, text]) => (
                          <Pressable
                            key={source}
                            style={[styles.menuFlowOption, menuPickerInProgress && styles.menuPickerDisabled]}
                            onPress={() => chooseMenuUploadSource(source)}
                            disabled={menuPickerInProgress}
                          >
                            <View style={styles.menuFlowOptionIcon}><Ionicons name={icon} size={21} color="#4A6095" /></View>
                            <View style={styles.menuFlowOptionCopy}><Text style={styles.menuFlowOptionTitle}>{title}</Text><Text style={styles.menuFlowOptionText}>{text}</Text></View>
                            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                          </Pressable>
                        ))}
                      </>
                    ) : null}
                    <Pressable style={styles.menuFlowCancel} onPress={closeMenuAddFlow}><Text style={styles.menuFlowCancelText}>Abbrechen</Text></Pressable>
                  </View>
                </View>
              </Modal>

              <Modal visible={Boolean(menuUnsavedTarget !== null)} transparent animationType="fade" onRequestClose={() => setMenuUnsavedTarget(null)}>
                <View style={styles.menuFlowBackdrop}>
                  <View style={[styles.menuFlowSheet, styles.menuDecisionSheet, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
                    <Text style={styles.menuFlowTitle}>Änderungen speichern?</Text>
                    <Text style={styles.menuFlowSubtitle}>Es gibt noch nicht gespeicherte Änderungen. Sonst gehen sie verloren.</Text>
                    <Pressable style={styles.menuDecisionPrimary} onPress={() => resolveUnsavedMenuChange('save')}><Text style={styles.menuDecisionPrimaryText}>Speichern</Text></Pressable>
                    <Pressable style={styles.menuDecisionSecondary} onPress={() => resolveUnsavedMenuChange('discard')}><Text style={styles.menuDecisionSecondaryText}>Verwerfen</Text></Pressable>
                    <Pressable style={styles.menuFlowCancel} onPress={() => setMenuUnsavedTarget(null)}><Text style={styles.menuFlowCancelText}>Abbrechen</Text></Pressable>
                  </View>
                </View>
              </Modal>

              <Modal visible={Boolean(menuDeleteConfirmKind)} transparent animationType="fade" onRequestClose={() => setMenuDeleteConfirmKind(null)}>
                <View style={styles.menuFlowBackdrop}>
                  <View style={[styles.menuFlowSheet, styles.menuDecisionSheet, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
                    <Text style={styles.menuFlowTitle}>Wirklich löschen?</Text>
                    <Text style={styles.menuFlowSubtitle}>
                      {menuDeleteConfirmKind?.type === 'card' ? 'Die komplette Karte wird gelöscht.' : 'Dieses Gericht wird aus der Karte entfernt.'}
                    </Text>
                    <Pressable
                      style={styles.menuDecisionDanger}
                      onPress={() => menuDeleteConfirmKind?.type === 'card'
                        ? scheduleMenuCardDelete(menuDeleteConfirmKind.kind)
                        : scheduleMenuItemDelete(menuDeleteConfirmKind.kind, menuDeleteConfirmKind.item)}
                    >
                      <Text style={styles.menuDecisionDangerText}>Löschen</Text>
                    </Pressable>
                    <Pressable style={styles.menuFlowCancel} onPress={() => setMenuDeleteConfirmKind(null)}><Text style={styles.menuFlowCancelText}>Abbrechen</Text></Pressable>
                  </View>
                </View>
              </Modal>

              <Modal
                visible={menuAnalyticsOpen}
                transparent
                animationType="fade"
                onRequestClose={() => setMenuAnalyticsOpen(false)}
              >
                <View style={styles.menuAnalyticsModalRoot}>
                  <View style={styles.modalBackdrop}>
                    <View style={[styles.menuAnalyticsModal, { maxHeight: Math.max(340, windowHeight * 0.68) }]}>
                    <View style={styles.menuAnalyticsModalHeader}>
                      <View>
                        <Text style={styles.menuAnalyticsModalTitle}>Aufrufe</Text>
                        <Text style={styles.menuAnalyticsModalText}>
                          {{
                            regular: 'Speisekarte',
                            lunch: 'Mittagstisch',
                            offers: 'Angebote',
                            dishes: 'Gerichte',
                            events: 'Events'
                          }[menuAnalyticsKind] || 'Statistik'}
                        </Text>
                      </View>
                      <Pressable style={styles.editorCloseIconButton} onPress={() => setMenuAnalyticsOpen(false)}>
                        <Ionicons name="close" size={19} color={colors.muted} />
                      </Pressable>
                    </View>
                    <View style={styles.menuAnalyticsRangeRow}>
                      <Pressable
                        style={styles.menuAnalyticsQuickRangeButton}
                        onPress={resetMenuAnalyticsRange}
                      >
                        <Ionicons name="calendar-outline" size={15} color="#4A6095" />
                        <Text style={styles.menuAnalyticsQuickRangeText}>Letzte 7 Tage</Text>
                      </Pressable>
                      <Pressable
                        style={styles.menuAnalyticsDateButton}
                        onPress={() => openMenuAnalyticsDatePicker('from')}
                      >
                        <Text style={styles.menuAnalyticsDateLabel}>Von</Text>
                        <Text style={styles.menuAnalyticsDateValue} numberOfLines={1}>
                          {formatIsoDateLabel(menuAnalyticsRange.from)}
                        </Text>
                      </Pressable>
                      <Pressable
                        style={styles.menuAnalyticsDateButton}
                        onPress={() => openMenuAnalyticsDatePicker('to')}
                      >
                        <Text style={styles.menuAnalyticsDateLabel}>Bis</Text>
                        <Text style={styles.menuAnalyticsDateValue} numberOfLines={1}>
                          {formatIsoDateLabel(menuAnalyticsRange.to)}
                        </Text>
                      </Pressable>
                    </View>
                    <ScrollView showsVerticalScrollIndicator={false}>
                      {(menuAnalytics?.[menuAnalyticsKind]?.days || []).map((entry) => (
                        <View key={`${menuAnalyticsKind}-${entry.date}`} style={styles.menuAnalyticsDayRow}>
                          <Text style={styles.menuAnalyticsDayLabel}>
                            {new Date(`${entry.date}T12:00:00Z`).toLocaleDateString('de-DE', {
                              weekday: 'short',
                              day: '2-digit',
                              month: '2-digit',
                              timeZone: restaurantTimeZone
                            })}
                          </Text>
                          <Text style={styles.menuAnalyticsDayValue}>{entry.views}</Text>
                        </View>
                      ))}
                      {['offers', 'dishes', 'events'].includes(menuAnalyticsKind) ? (
                        <View style={styles.menuAnalyticsDetailSection}>
                          <Text style={styles.menuAnalyticsDetailTitle}>
                            {menuAnalyticsKind === 'dishes'
                              ? 'Gerichte in diesem Zeitraum'
                              : menuAnalyticsKind === 'events'
                              ? 'Events in diesem Zeitraum'
                              : 'Angebote in diesem Zeitraum'}
                          </Text>
                          {(menuAnalytics?.[menuAnalyticsKind]?.items || []).length ? (
                            (menuAnalytics?.[menuAnalyticsKind]?.items || []).map((entry) => (
                              <View key={`${menuAnalyticsKind}-${entry.id}`} style={styles.menuAnalyticsDetailRow}>
                                <Text style={styles.menuAnalyticsDetailName} numberOfLines={2}>{entry.title}</Text>
                                <Text style={styles.menuAnalyticsDetailValue}>{entry.views}</Text>
                              </View>
                            ))
                          ) : (
                            <Text style={styles.menuAnalyticsEmptyText}>Keine Aufrufe in diesem Zeitraum.</Text>
                          )}
                        </View>
                      ) : null}
                    </ScrollView>
                    </View>
                  </View>
                  {Platform.OS === 'ios' && menuAnalyticsDatePickerState.visible ? (
                    <View style={styles.menuAnalyticsPickerOverlay}>
                      <Pressable style={styles.menuAnalyticsPickerDismissArea} onPress={closeMenuAnalyticsDatePicker} />
                      <View style={[styles.menuAnalyticsPickerSheet, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
                        <View style={styles.menuAnalyticsPickerHeader}>
                          <View>
                            <Text style={styles.menuAnalyticsPickerTitle}>
                              {menuAnalyticsDatePickerState.field === 'from' ? 'Von-Datum wählen' : 'Bis-Datum wählen'}
                            </Text>
                            <Text style={styles.menuAnalyticsPickerSubtitle}>
                              {formatIsoDateLabel(toIsoDateText(menuAnalyticsDatePickerState.value))}
                            </Text>
                          </View>
                          <Pressable style={styles.editorCloseIconButton} onPress={closeMenuAnalyticsDatePicker}>
                            <Ionicons name="close" size={19} color={colors.muted} />
                          </Pressable>
                        </View>
                        <DateTimePicker
                          value={menuAnalyticsDatePickerState.value}
                          mode="date"
                          display="inline"
                          locale="de-DE"
                          onChange={handleMenuAnalyticsDatePickerChange}
                          style={styles.menuAnalyticsPickerCalendar}
                        />
                        <View style={styles.menuAnalyticsPickerActions}>
                          <Pressable style={styles.menuAnalyticsPickerCancelButton} onPress={closeMenuAnalyticsDatePicker}>
                            <Text style={styles.menuAnalyticsPickerCancelText}>Abbrechen</Text>
                          </Pressable>
                          <Pressable style={styles.menuAnalyticsPickerConfirmButton} onPress={confirmMenuAnalyticsDatePicker}>
                            <Text style={styles.menuAnalyticsPickerConfirmText}>Übernehmen</Text>
                          </Pressable>
                        </View>
                      </View>
                    </View>
                  ) : null}
                </View>
              </Modal>
              {Platform.OS === 'android' && menuAnalyticsDatePickerState.visible ? (
                <DateTimePicker
                  value={menuAnalyticsDatePickerState.value}
                  mode="date"
                  display="default"
                  onChange={handleMenuAnalyticsDatePickerChange}
                />
              ) : null}

              <Modal visible={menuItemEditorOpen} transparent animationType="fade" onRequestClose={closeMenuItemEditor}>
                <View style={[styles.modalBackdrop, isSmallPhone && styles.modalBackdropSmallPhone]}>
                  <View
                    style={[
                      styles.modalCard,
                      isCompactLayout && styles.modalCardCompact,
                      isSmallPhone && styles.modalCardSmallPhone,
                      settingsModalSizeStyle,
                      modalTopOffsetStyle
                    ]}
                  >
                    <ScrollView
                      showsVerticalScrollIndicator={false}
                      contentContainerStyle={[
                        styles.modalScrollContent,
                        isSmallPhone && styles.modalScrollContentSmallPhone,
                        { paddingBottom: Math.max(insets.bottom, spacing.sm) }
                      ]}
                      keyboardShouldPersistTaps="always"
                    >
                      <View style={styles.editorHeaderRow}>
                        <Text style={[styles.cardTitle, compactCardTitleStyle]}>
                          {menuItemEditor.id
                            ? menuItemEditorKind === 'lunch'
                              ? 'Mittagstisch-Gericht bearbeiten'
                              : 'Gericht bearbeiten'
                            : menuItemEditorKind === 'lunch'
                            ? 'Neues Mittagstisch-Gericht'
                            : 'Neues Gericht'}
                        </Text>
                        <View style={styles.editorHeaderActions}>
                          {menuItemEditor.id ? (
                            <Pressable style={styles.editorTrashIconButton} onPress={deleteMenuItemEditor}>
                              <Ionicons name="trash-outline" size={17} color={colors.accentWarm} />
                            </Pressable>
                          ) : null}
                          <Pressable style={styles.editorCloseIconButton} onPress={closeMenuItemEditor}>
                            <Ionicons name="close-outline" size={18} color={colors.muted} />
                          </Pressable>
                        </View>
                      </View>
                      <View style={[styles.menuEditorFieldGroup, styles.menuEditorFieldGroupFirst]}>
                        <View style={styles.menuEditorNamePriceRow}>
                          <View style={styles.menuEditorNameField}>
                            <Text style={styles.menuEditorFieldLabel}>Name</Text>
                            <TextInput
                              value={menuItemEditor.name}
                              onChangeText={(value) => updateMenuItemEditorField('name', value)}
                              placeholder="Gerichtname"
                              style={[styles.input, styles.menuEditorInput, compactInputStyle]}
                            />
                          </View>
                          <View style={styles.menuEditorPriceField}>
                            <Text style={styles.menuEditorFieldLabel}>Preis</Text>
                            <TextInput
                              value={menuItemEditor.priceText}
                              onChangeText={(value) => updateMenuItemEditorField('priceText', value)}
                              placeholder="0,00 €"
                              keyboardType="decimal-pad"
                              style={[styles.input, styles.menuEditorInput, compactInputStyle]}
                            />
                          </View>
                        </View>
                      </View>
                      <View style={styles.menuEditorFieldGroup}>
                        <Text style={styles.menuEditorFieldLabel}>Beschreibung</Text>
                        <TextInput
                          value={menuItemEditor.description}
                          onChangeText={(value) => updateMenuItemEditorField('description', value)}
                          placeholder="Beschreibung (optional)"
                          style={[styles.input, styles.menuEditorInput, styles.menuEditorDescriptionInput, compactTextAreaStyle]}
                          multiline
                        />
                      </View>
                      <View style={styles.menuEditorFieldGroup}>
                        <Text style={styles.menuEditorFieldLabel}>Kategorie</Text>
                        <View style={styles.digitalCategoryRow}>
                          {digitalCategories.map((category) => (
                            <Pressable
                              key={category}
                              style={[
                                styles.digitalCategoryChip,
                                menuItemEditor.category === category && styles.digitalCategoryChipActive
                              ]}
                              onPress={() => updateMenuItemEditorField('category', category)}
                            >
                              <Text
                                style={[
                                  styles.digitalCategoryChipText,
                                  menuItemEditor.category === category && styles.digitalCategoryChipTextActive
                                ]}
                              >
                                {toDigitalCategoryLabel(category)}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                      </View>
                      <View style={styles.menuEditorFieldGroup}>
                        <Text style={styles.menuEditorFieldLabel}>Allergene</Text>
                        <View style={styles.menuEditorAllergenRow}>
                          {menuItemAllergenOptions.map((allergen) => {
                            const selected = normalizeAllergenList(menuItemEditor.allergensText).includes(allergen);
                            return (
                              <Pressable
                                key={allergen}
                                style={[styles.menuEditorAllergenChip, selected && styles.menuEditorAllergenChipActive]}
                                onPress={() => toggleMenuItemEditorAllergen(allergen)}
                              >
                                <Text
                                  style={[
                                    styles.menuEditorAllergenChipText,
                                    selected && styles.menuEditorAllergenChipTextActive
                                  ]}
                                >
                                  {selected ? '✓ ' : ''}{allergen}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                        <TextInput
                          value={menuItemEditor.allergensText}
                          onChangeText={(value) => updateMenuItemEditorField('allergensText', value)}
                          placeholder="Weitere Allergene (optional)"
                          style={[styles.input, styles.menuEditorInput, compactInputStyle]}
                        />
                      </View>
                      <View style={styles.menuEditorFieldGroup}>
                        <Text style={styles.menuEditorFieldLabel}>Bereich (optional)</Text>
                        <TextInput
                          value={menuItemEditor.sectionTitle}
                          onChangeText={(value) => updateMenuItemEditorField('sectionTitle', value)}
                          placeholder="z. B. Hauptgerichte, Salate"
                          style={[styles.input, styles.menuEditorInput, compactInputStyle]}
                        />
                      </View>
                      {menuItemEditorKind === 'lunch' ? (
                        <>
                          <View style={styles.menuEditorFieldGroup}>
                            <Text style={styles.menuEditorFieldLabel}>Verfügbar an</Text>
                            <View style={styles.menuEditorWeekdayRow}>
                              {lunchWeekdayOptions.map((option) => {
                                const active = menuItemEditor.availableWeekdays.includes(option.key);
                                return (
                                  <Pressable
                                    key={`lunch-weekday-${option.key}`}
                                    style={[styles.menuEditorWeekdayChip, active && styles.menuEditorWeekdayChipActive]}
                                    onPress={() => toggleMenuItemEditorWeekday(option.key)}
                                  >
                                    <Text
                                      style={[
                                        styles.menuEditorWeekdayChipText,
                                        active && styles.menuEditorWeekdayChipTextActive
                                      ]}
                                    >
                                      {option.label}
                                    </Text>
                                  </Pressable>
                                );
                              })}
                            </View>
                          </View>
                          <View style={styles.menuEditorFieldGroup}>
                            <Text style={styles.menuEditorFieldLabel}>Gültig</Text>
                            <View style={styles.lunchValidityDateRow}>
                              <Pressable
                                style={styles.lunchValidityDateButton}
                                onPress={() => openLunchDatePicker('item', 'fromDate')}
                              >
                                <Text style={styles.lunchValidityDateLabel}>Von</Text>
                                <Text style={styles.lunchValidityDateValue}>
                                  {formatIsoDateLabel(menuItemEditor.validityFromDate)}
                                </Text>
                              </Pressable>
                              <Pressable
                                style={styles.lunchValidityDateButton}
                                onPress={() => openLunchDatePicker('item', 'toDate')}
                              >
                                <Text style={styles.lunchValidityDateLabel}>Bis</Text>
                                <Text style={styles.lunchValidityDateValue}>
                                  {menuItemEditor.validityToDate
                                    ? formatIsoDateLabel(menuItemEditor.validityToDate)
                                    : 'Ohne Ende'}
                                </Text>
                              </Pressable>
                            </View>
                            {menuItemEditor.validityToDate ? (
                              <Pressable
                                style={styles.lunchValidityNoEndButton}
                                onPress={() => updateMenuItemEditorField('validityToDate', '')}
                              >
                                <Text style={styles.lunchValidityNoEndButtonText}>Bis: Ohne Ende</Text>
                              </Pressable>
                            ) : null}
                            <Pressable style={styles.lunchValidityInlineApply} onPress={applyMenuItemValidityRange}>
                              <Text style={styles.lunchValidityInlineApplyText}>Zeitraum übernehmen</Text>
                            </Pressable>
                            <ToggleSwitch
                              compact
                              label="Gericht aktiv"
                              value={Boolean(menuItemEditor.active)}
                              onPress={() => updateMenuItemEditorField('active', !menuItemEditor.active)}
                            />
                          </View>
                        </>
                      ) : null}
                      <View style={styles.editorFooterActions}>
                        <Pressable style={styles.button} onPress={saveMenuItemEditor}>
                          <View style={styles.buttonIconRow}>
                            <Ionicons name="save-outline" size={17} color={colors.white} />
                            <Text style={styles.buttonText}>Speichern</Text>
                          </View>
                        </Pressable>
                        <Pressable style={styles.outlineButton} onPress={openMenuItemOfferModal}>
                          <View style={styles.buttonIconRow}>
                            <Ionicons name="pricetag-outline" size={17} color={colors.accent} />
                            <Text style={styles.outlineButtonText}>Als Angebot übernehmen</Text>
                          </View>
                        </Pressable>
                        <Pressable style={styles.editorCancelCenterButton} onPress={closeMenuItemEditor}>
                          <View style={styles.buttonIconRow}>
                            <Ionicons name="close-outline" size={17} color={colors.muted} />
                            <Text style={styles.editorCancelCenterText}>Abbrechen</Text>
                          </View>
                        </Pressable>
                      </View>
                    </ScrollView>
                  </View>
                </View>
              </Modal>

              <Modal
                visible={menuItemOfferModalOpen}
                transparent
                animationType="fade"
                onRequestClose={returnFromOfferModalToEditor}
              >
                <View style={[styles.modalBackdrop, isSmallPhone && styles.modalBackdropSmallPhone]}>
                  <View
                    style={[
                      styles.modalCard,
                      isCompactLayout && styles.modalCardCompact,
                      isSmallPhone && styles.modalCardSmallPhone,
                      settingsModalSizeStyle,
                      modalTopOffsetStyle
                    ]}
                  >
                    <ScrollView
                      showsVerticalScrollIndicator={false}
                      contentContainerStyle={[
                        styles.modalScrollContent,
                        isSmallPhone && styles.modalScrollContentSmallPhone,
                        { paddingBottom: Math.max(insets.bottom, spacing.sm) }
                      ]}
                      keyboardShouldPersistTaps="handled"
                    >
                      <View style={styles.editorHeaderRow}>
                        <Text style={[styles.cardTitle, compactCardTitleStyle]}>Als Angebot übernehmen</Text>
                        <Pressable
                          style={styles.editorCloseIconButton}
                          onPress={returnFromOfferModalToEditor}
                        >
                          <Ionicons name="close-outline" size={18} color={colors.ink} />
                        </Pressable>
                      </View>

                      <Text style={[styles.helperText, compactHelperTextStyle]}>
                        Nur die wichtigen Felder für das Angebot.
                      </Text>
                      <Text style={[styles.sectionLabel, compactSectionLabelStyle]}>Bereich für dieses Angebot</Text>
                      <View style={styles.mealSlotRowCompact}>
                        {mealSlotOptions.map((option) => (
                          <MealSlotChip
                            key={`menu-item-offer-${option.key}`}
                            label={option.label}
                            compact
                            tiny
                            active={menuItemOfferMealSlot === option.key}
                            onPress={async () => {
                              const ok = await ensureOfferMealSlotEnabled(option.key);
                              if (ok) {
                                setMenuItemOfferMealSlot(option.key);
                              }
                            }}
                          />
                        ))}
                      </View>
                      <ToggleSwitch
                        compact
                        label="Vorbestellung"
                        value={menuItemOfferPreorderEnabled}
                        onPress={() => setMenuItemOfferPreorderEnabled((prev) => !prev)}
                      />
                      <Pressable
                        style={[styles.buttonSmall, restaurantLoading && styles.buttonSmallDisabled]}
                        onPress={handleTakeMenuItemAsOffer}
                        disabled={restaurantLoading}
                      >
                        <View style={styles.buttonIconRow}>
                          <Ionicons name="checkmark-circle-outline" size={16} color={colors.white} />
                          <Text style={styles.buttonSmallText}>
                            {restaurantLoading ? 'Speichern...' : 'Jetzt als Angebot speichern'}
                          </Text>
                        </View>
                      </Pressable>
                      <Pressable style={styles.outlineButton} onPress={handleDeactivateMenuItemOffer}>
                        <View style={styles.buttonIconRow}>
                          <Ionicons name="arrow-undo-outline" size={16} color={colors.accent} />
                          <Text style={styles.outlineButtonText}>Angebot rückgängig (offline)</Text>
                        </View>
                      </Pressable>
                      {digitalMenuError ? <Text style={styles.errorText}>{digitalMenuError}</Text> : null}
                      {digitalMenuStatus ? <Text style={styles.status}>{digitalMenuStatus}</Text> : null}
                      <Pressable
                        style={styles.editorCancelCenterButton}
                        onPress={returnFromOfferModalToEditor}
                      >
                        <View style={styles.buttonIconRow}>
                          <Ionicons name="chevron-back-outline" size={17} color={colors.muted} />
                          <Text style={styles.editorCancelCenterText}>Zurück</Text>
                        </View>
                      </Pressable>
                    </ScrollView>
                  </View>
                </View>
              </Modal>

              {activePanel === 'offers' ? (
                <>
                  {renderPanelScreenHeader('Meine Angebote')}
                  <Text style={styles.offersPanelIntro}>
                    Öffne nur den Bereich, den du gerade brauchst.
                  </Text>
                  <Pressable
                    style={[styles.offerAccordionHeader, offersCreateOpen && styles.offerAccordionHeaderActive]}
                    onPress={() => setOffersCreateOpen((current) => !current)}
                  >
                    <View style={styles.offerAccordionTitleRow}>
                      <Ionicons name="add-circle-outline" size={20} color={colors.accent} />
                      <Text style={styles.offerAccordionTitle}>
                        {editingOffer ? 'Angebot bearbeiten' : 'Angebot erstellen'}
                      </Text>
                    </View>
                    <Ionicons
                      name={offersCreateOpen ? 'chevron-up' : 'chevron-down'}
                      size={19}
                      color={colors.muted}
                    />
                  </Pressable>
                </>
              ) : null}

              {activePanel === 'offers' && offersCreateOpen
                ? (
                    <View
                      style={[
                        styles.card,
                        styles.panelScreenCard,
                        compactCardStyle,
                        isSmallPhone && styles.panelScreenCardSmallPhone
                      ]}
                    >
                <View style={[styles.composerBody, styles.panelComposerBody]}>
                  <TextInput
                    placeholder="Gericht / Angebot"
                    value={title}
                    onChangeText={setTitle}
                    style={[styles.input, compactInputStyle]}
                  />
                  <TextInput
                    placeholder="Preis (EUR)"
                    value={price}
                    onChangeText={setPrice}
                    keyboardType="numbers-and-punctuation"
                    style={[styles.input, compactInputStyle]}
                  />
                  <TextInput
                    placeholder="Kurzbeschreibung"
                    value={description}
                    onChangeText={setDescription}
                    style={[styles.input, compactInputStyle, styles.textArea, compactTextAreaStyle]}
                    multiline
                  />
                  <Text style={[styles.sectionLabel, compactSectionLabelStyle]}>Bereich für dieses Angebot</Text>
                  <View style={styles.mealSlotRow}>
                    {mealSlotOptions.map((option) => {
                      return (
                        <MealSlotChip
                          key={option.key}
                          label={option.label}
                          active={offerMealSlot === option.key}
                          compact
                          onPress={async () => {
                            const ok = await ensureOfferMealSlotEnabled(option.key);
                            if (ok) {
                              setOfferMealSlot(option.key);
                            }
                          }}
                        />
                      );
                    })}
                  </View>
                  <Text style={[styles.sectionLabel, compactSectionLabelStyle]}>Angebot-Art</Text>
                  <View style={styles.mealSlotRowCompact}>
                    {offerTypeOptions.map((option) => (
                      <MealSlotChip
                        key={`offer-type-${option.key}`}
                        label={option.label}
                        active={offerType === option.key}
                        compact
                        tiny
                        onPress={() => setOfferType(option.key)}
                      />
                    ))}
                  </View>
                  <Text style={[styles.helperText, compactHelperTextStyle]}>
                    Nicht aktiviert? Bereich antippen, wird automatisch aktiviert.
                  </Text>
                  <Text style={[styles.helperText, compactHelperTextStyle]}>
                    Aktive Restaurant-Bereiche:{' '}
                    {profileSlotList.length
                      ? profileSlotList.map((slot) => mealSlotLabelByKey[slot] || slot).join(', ')
                      : 'keine aktiviert'}
                  </Text>
                  <View style={styles.toggleGroup}>
                    <ToggleSwitch
                      label="Vegan"
                      value={isVegan}
                      onPress={() => setIsVegan((prev) => !prev)}
                    />
                    <ToggleSwitch
                      label="Vegetarisch"
                      value={isVegetarian}
                      onPress={() => setIsVegetarian((prev) => !prev)}
                    />
                    <ToggleSwitch
                      label="Vorbestellung"
                      value={preorderEnabled}
                      onPress={() => setPreorderEnabled((prev) => !prev)}
                    />
                  </View>
                  <Pressable style={styles.imageButton} onPress={handlePickImage}>
                    <Ionicons name="image" size={18} color={colors.ink} />
                    <Text style={styles.imageButtonText}>Bild auswählen (optional)</Text>
                  </Pressable>
                  {imageUri ? <Image source={{ uri: imageUri }} style={styles.preview} /> : null}
                  <Text style={[styles.helperText, compactHelperTextStyle]}>
                    Das Bild wird beim Speichern auf den Server hochgeladen.
                  </Text>
                  <Pressable style={[styles.button, isSmallPhone && styles.buttonCompactSmallPhone]} onPress={handleSubmit}>
                    <Text style={styles.buttonText}>
                      {restaurantLoading
                        ? 'Bitte warten...'
                        : editingOffer
                        ? 'Änderungen speichern'
                        : 'Angebot online stellen'}
                    </Text>
                  </Pressable>
                  {editingOffer ? (
                    <Pressable style={styles.outlineButton} onPress={cancelEdit}>
                      <Text style={styles.outlineButtonText}>Bearbeitung abbrechen</Text>
                    </Pressable>
                  ) : null}
                  {restaurantError ? <Text style={styles.errorText}>{restaurantError}</Text> : null}
                  {status ? <Text style={styles.status}>{status}</Text> : null}
                </View>
              </View>
                )
                : null}

              {activePanel === 'offers' ? (
                <Pressable
                  style={[styles.offerAccordionHeader, offersListOpen && styles.offerAccordionHeaderActive]}
                  onPress={() => setOffersListOpen((current) => !current)}
                >
                  <View style={styles.offerAccordionTitleRow}>
                    <Ionicons name="list-outline" size={20} color={colors.accent} />
                    <Text style={styles.offerAccordionTitle}>Aktive Angebote ansehen</Text>
                    <View style={styles.offerAccordionCountBadge}>
                      <Text style={styles.offerAccordionCountText}>{activeOffersCount}</Text>
                    </View>
                  </View>
                  <Ionicons
                    name={offersListOpen ? 'chevron-up' : 'chevron-down'}
                    size={19}
                    color={colors.muted}
                  />
                </Pressable>
              ) : null}

              {activePanel === 'offers' && offersListOpen
                ? (
                    <View
                      style={[
                        styles.card,
                        styles.panelScreenCard,
                        compactCardStyle,
                        isSmallPhone && styles.panelScreenCardSmallPhone
                      ]}
                    >
                {[...restaurantOffers]
                  .sort((a, b) => Number(b.active !== false) - Number(a.active !== false))
                  .map((offer) => (
                  <View key={offer.id} style={[styles.offerRow, offer.active === false && styles.offerRowOffline]}>
                    <View style={styles.offerInfo}>
                      <View style={styles.offerTitleRow}>
                        <Text style={styles.offerTitle}>{offer.title}</Text>
                        <View style={[styles.statusPill, offer.active === false ? styles.statusOff : styles.statusOn]}>
                          <Text style={styles.statusPillText}>
                            {offer.active === false ? 'Offline' : 'Online'}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.offerMetaRow}>
                        <Text style={styles.offerMeta}>
                          {formatPrice(offer.price)} - {mealSlotLabelByKey[offer.mealSlot] || 'Mittagstisch'}
                        </Text>
                        <View style={styles.offerTypeBadge}>
                          <Text style={styles.offerTypeBadgeText}>{getOfferTypeLabelFromTags(offer.tags)}</Text>
                        </View>
                      </View>
                      <Text style={styles.offerDescription} numberOfLines={2}>
                        {offer.description || 'Keine Beschreibung'}
                      </Text>
                    </View>
                    <View style={[styles.offerActions, isSmallPhone && styles.offerActionsSmallPhone]}>
                      <ToggleSwitch
                        compact
                        label="Online"
                        value={offer.active !== false}
                        onPress={() =>
                          updateRestaurantOffer(offer.id, {
                            active: offer.active === false
                          })
                        }
                      />
                      <ToggleSwitch
                        compact
                        label="Vorbestellung"
                        value={offer.preorderEnabled}
                        onPress={() =>
                          updateRestaurantOffer(offer.id, {
                            preorderEnabled: !offer.preorderEnabled
                          })
                        }
                      />
                      <Pressable style={styles.offerEditButton} onPress={() => startEdit(offer)}>
                        <Ionicons name="create" size={16} color={colors.white} />
                        <Text style={styles.offerEditButtonText}>Bearbeiten</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.offerDeleteButton, restaurantLoading && styles.offerDeleteButtonDisabled]}
                        onPress={() => handleDeleteOffer(offer)}
                        disabled={restaurantLoading}
                      >
                        <Ionicons name="trash-outline" size={16} color={colors.white} />
                        <Text style={styles.offerEditButtonText}>Löschen</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
                {!restaurantOffers.length ? (
                  <Text style={[styles.helperText, compactHelperTextStyle]}>Noch keine Angebote erstellt.</Text>
                ) : null}
              </View>
                )
                : null}

              {activePanel === 'reviews'
                ? renderViewportPanel('Bewertungen', renderRestaurantReviewsPanel())
                : null}

              {activePanel === 'events'
                ? renderViewportPanel('Events', renderRestaurantEventsPanel())
                : null}

              {activePanel === 'services'
                ? renderViewportPanel('Events & Catering', renderRestaurantServicesPanel())
                : null}

              {activePanel === 'statistics'
                ? renderViewportPanel('Statistik', renderRestaurantStatisticsPanel())
                : null}

              {activePanel === 'requests'
                ? renderViewportPanel('Anfragen', renderRestaurantRequestsPanel())
                : null}


            </>
          )}

        </ScrollView>
        <Modal
          visible={reviewReportingEnabled && Boolean(reviewReportTarget)}
          transparent
          animationType="fade"
          onRequestClose={closeReviewReport}
        >
          <KeyboardAvoidingView
            style={styles.reviewReportModalWrap}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <Pressable style={styles.reviewReportBackdrop} onPress={closeReviewReport} />
            <View style={[styles.reviewReportSheet, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
              <View style={styles.reviewReportHandle} />
              <View style={styles.reviewReportHeader}>
                <View style={styles.reviewReportHeaderText}>
                  <Text style={styles.reviewReportTitle}>Bewertung melden</Text>
                  <Text style={styles.reviewReportSubtitle}>
                    Nah&Fein prüft deine Meldung. Die Bewertung bleibt bis zur Entscheidung sichtbar.
                  </Text>
                </View>
                <Pressable style={styles.settingsModalHeaderButton} onPress={closeReviewReport}>
                  <Ionicons name="close" size={22} color={colors.ink} />
                </Pressable>
              </View>
              <ScrollView
                style={styles.reviewReportScroll}
                contentContainerStyle={styles.reviewReportScrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.reviewReportSectionLabel}>Warum meldest du diese Bewertung?</Text>
                <View style={styles.reviewReportReasonList}>
                  {reviewReportReasonOptions.map((option) => {
                    const selected = reviewReportReason === option.key;
                    return (
                      <Pressable
                        key={option.key}
                        style={[styles.reviewReportReason, selected && styles.reviewReportReasonSelected]}
                        onPress={() => {
                          setReviewReportReason(option.key);
                          setReviewReportError('');
                        }}
                      >
                        <Ionicons
                          name={selected ? 'radio-button-on' : 'radio-button-off'}
                          size={20}
                          color={selected ? colors.accentCool : colors.muted}
                        />
                        <Text style={[styles.reviewReportReasonText, selected && styles.reviewReportReasonTextSelected]}>
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={styles.reviewReportSectionLabel}>Optionaler Hinweis</Text>
                <TextInput
                  value={reviewReportNote}
                  onChangeText={(value) => setReviewReportNote(value.slice(0, 1000))}
                  placeholder="Was soll Nah&Fein bei der Prüfung beachten?"
                  multiline
                  textAlignVertical="top"
                  style={[styles.input, styles.reviewReportNoteInput]}
                />
                <Text style={styles.reviewReportCounter}>{reviewReportNote.length}/1000</Text>
                {reviewReportError ? <Text style={styles.errorText}>{reviewReportError}</Text> : null}
              </ScrollView>
              <View style={styles.reviewReportFooter}>
                <Pressable
                  style={[styles.button, (!reviewReportReason || reviewReportSending) && styles.offerDeleteButtonDisabled]}
                  onPress={handleSubmitReviewReport}
                  disabled={!reviewReportReason || reviewReportSending}
                >
                  <Text style={styles.buttonText}>
                    {reviewReportSending ? 'Wird gemeldet...' : 'Meldung senden'}
                  </Text>
                </Pressable>
                <Pressable style={styles.outlineButton} onPress={closeReviewReport} disabled={reviewReportSending}>
                  <Text style={styles.outlineButtonText}>Abbrechen</Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
        {Platform.OS === 'ios' ? (
          <InputAccessoryView nativeID={GASTRO_KEYBOARD_ACCESSORY_ID}>
            <View style={styles.keyboardAccessory}>
              <View style={styles.keyboardAccessoryDivider} />
              <Pressable style={styles.keyboardAccessoryDoneButton} onPress={Keyboard.dismiss}>
                <Text style={styles.keyboardAccessoryDoneText}>Fertig</Text>
              </Pressable>
            </View>
          </InputAccessoryView>
        ) : null}
        {showDashboardChrome ? (
          <View
            style={[
              styles.dashboardFooter,
              { paddingBottom: Math.max(insets.bottom, spacing.sm) }
            ]}
          >
            {onBack ? (
              <Pressable
                style={({ pressed }) => [
                  styles.dashboardFooterButton,
                  pressed && styles.dashboardFooterButtonPressed
                ]}
                onPress={onBack}
              >
                <Ionicons name="home-outline" size={22} color={colors.accent} />
                <Text style={styles.dashboardFooterButtonText}>Home</Text>
              </Pressable>
            ) : null}
            <Pressable
              style={({ pressed }) => [
                styles.dashboardFooterButton,
                pressed && styles.dashboardFooterButtonPressed
              ]}
              onPress={() => openPanel('support')}
            >
              <Ionicons name="chatbubble-ellipses-outline" size={22} color={colors.accentCool} />
              <Text style={styles.dashboardFooterButtonText}>Support</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.dashboardFooterButton,
                pressed && styles.dashboardFooterButtonPressed
              ]}
              onPress={() => openDashboardSettings()}
            >
              <Ionicons name="settings-outline" size={22} color={colors.accent} />
              <Text style={styles.dashboardFooterButtonText}>Einstellungen</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.dashboardFooterButton,
                pressed && styles.dashboardFooterButtonPressed
              ]}
              onPress={confirmDashboardLogout}
            >
              <Ionicons name="log-out-outline" size={22} color={colors.accentWarm} />
              <Text style={[styles.dashboardFooterButtonText, styles.dashboardFooterLogoutText]}>
                Abmelden
              </Text>
            </Pressable>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: 140
  },
  scrollContentGrow: {
    flexGrow: 1
  },
  scrollContentCompact: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: 120
  },
  scrollContentSmallPhone: {
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: 96
  },
  scrollContentViewport: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0
  },
  topBar: {
    marginBottom: spacing.lg
  },
  topBarSmallPhone: {
    marginBottom: spacing.md
  },
  topBarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.md
  },
  topBarActionsSmallPhone: {
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm
  },
  topBarActionsRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginLeft: 'auto',
    minWidth: 0
  },
  topBarActionsRightSmallPhone: {
    gap: spacing.xs
  },
  topBarPillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    flexShrink: 1,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    backgroundColor: colors.white,
    ...shadow
  },
  topBarPillButtonSmallPhone: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 9
  },
  topBarPillButtonText: {
    fontFamily: fonts.bodyStrong,
    color: colors.accent,
    fontSize: 12,
    flexShrink: 1
  },
  topBarIconButton: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    ...shadow
  },
  topBarIconButtonSmallPhone: {
    width: 42,
    height: 42,
    borderRadius: 14
  },
  iconPressed: {
    opacity: 0.85
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md
  },
  headerSmallPhone: {
    alignItems: 'flex-start',
    gap: spacing.xs
  },
  brandMark: {
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center'
  },
  brandMarkSmallPhone: {
    width: 44,
    height: 44,
    borderRadius: 14
  },
  logoImage: {
    width: 54,
    height: 54,
    borderRadius: 16
  },
  logoImageSmallPhone: {
    width: 38,
    height: 38,
    borderRadius: 10
  },
  headerText: {
    flex: 1
  },
  subtitle: {
    fontFamily: fonts.displaySoft,
    fontSize: 22,
    color: colors.ink
  },
  subtitleSmallPhone: {
    fontSize: 16,
    lineHeight: 19
  },
  authHeroWrap: {
    marginBottom: spacing.lg
  },
  authHeroWrapSmallPhone: {
    marginBottom: spacing.md
  },
  authHero: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center'
  },
  authHeroSmallPhone: {
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    minHeight: 180
  },
  authBackButton: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)'
  },
  authHeroLogo: {
    width: 82,
    height: 82,
    borderRadius: 20,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)'
  },
  authHeroLogoSmallPhone: {
    width: 64,
    height: 64,
    borderRadius: 16
  },
  authHeroTitle: {
    fontFamily: fonts.display,
    fontSize: 30,
    color: colors.white,
    textAlign: 'center'
  },
  authHeroTitleSmallPhone: {
    fontSize: 24
  },
  authHeroSubtitle: {
    marginTop: spacing.xs,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.95)',
    textAlign: 'center'
  },
  authHeroSubtitleSmallPhone: {
    fontSize: 13,
    lineHeight: 18
  },
  authSwitchLink: {
    marginTop: spacing.sm,
    alignSelf: 'center'
  },
  authSwitchText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 14,
    color: colors.accent
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: spacing.lg,
    ...shadow
  },
  cardSmallPhone: {
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md
  },
  dashboardScrollContent: {
    paddingBottom: 132
  },
  dashboardTopBar: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    minHeight: 62,
    alignItems: 'stretch',
    justifyContent: 'center',
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: colors.line,
    ...shadow
  },
  dashboardTopBarSmallPhone: {
    minHeight: 54,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.xs
  },
  dashboardHeaderSide: {
    width: 92,
    flexShrink: 0
  },
  dashboardHeaderSideSmallPhone: {
    width: 78
  },
  dashboardHomeButton: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 999,
    backgroundColor: colors.white
  },
  dashboardHomeButtonSmallPhone: {
    minHeight: 36,
    paddingHorizontal: spacing.xs
  },
  dashboardHomeButtonText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 12,
    color: colors.accent
  },
  dashboardRestaurantIdentity: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xs
  },
  websiteSyncDashboardButton: {
    minHeight: 48,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#CBE7F0',
    backgroundColor: '#F2FBFD',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm
  },
  websiteSyncDashboardButtonPressed: {
    opacity: 0.76
  },
  websiteSyncDashboardIcon: {
    width: 32,
    height: 32,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DDF5FA'
  },
  websiteSyncDashboardCopy: {
    flex: 1,
    minWidth: 0
  },
  websiteSyncDashboardTitle: {
    fontFamily: fonts.bodyStrong,
    fontSize: 14,
    color: colors.ink
  },
  websiteSyncDashboardText: {
    marginTop: 1,
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.muted
  },
  dashboardRestaurantLogo: {
    width: 42,
    height: 42,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white
  },
  dashboardRestaurantLogoSmallPhone: {
    width: 36,
    height: 36,
    borderRadius: 11
  },
  dashboardRestaurantName: {
    maxWidth: 260,
    flexShrink: 1,
    fontFamily: fonts.displaySoft,
    fontSize: 18,
    color: colors.ink,
    textAlign: 'center'
  },
  dashboardRestaurantNameSmallPhone: {
    fontSize: 14
  },
  dashboardGrid: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
    gap: spacing.sm
  },
  dashboardGridSmallPhone: {
    marginBottom: spacing.md,
    gap: spacing.xs
  },
  dashboardGridCompact: {
    gap: spacing.sm
  },
  dashboardTilePressable: {
    width: '48%',
    borderRadius: radius.lg,
    ...shadow
  },
  dashboardTilePressed: {
    opacity: 0.94,
    transform: [{ scale: 0.985 }]
  },
  dashboardTile: {
    width: '100%',
    minHeight: 158,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    padding: spacing.md,
    justifyContent: 'space-between',
    overflow: 'hidden'
  },
  dashboardTileCompact: {
    width: '100%',
    minHeight: 150
  },
  dashboardTileSmallPhone: {
    minHeight: 146,
    padding: spacing.sm
  },
  dashboardTileDisabled: {
    opacity: 0.52
  },
  dashboardTileHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  dashboardTileIcon: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  dashboardTileActive: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(0, 188, 212, 0.12)'
  },
  dashboardTileTitle: {
    fontFamily: fonts.bodyStrong,
    color: colors.white,
    fontSize: 17,
    lineHeight: 21
  },
  dashboardTileTitleSmallPhone: {
    fontSize: 15,
    lineHeight: 19
  },
  dashboardTileText: {
    marginTop: spacing.xs,
    fontFamily: fonts.body,
    color: 'rgba(255,255,255,0.92)',
    fontSize: 13,
    lineHeight: 18
  },
  dashboardTileTextSmallPhone: {
    fontSize: 11,
    lineHeight: 15
  },
  dashboardTileBadge: {
    minWidth: 30,
    height: 30,
    paddingHorizontal: 8,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)'
  },
  dashboardTileBadgeText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 13,
    color: colors.white
  },
  statisticsMetricGrid: {
    marginTop: spacing.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm
  },
  statisticsMetricCard: {
    flexGrow: 1,
    flexBasis: '46%',
    minHeight: 132,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    padding: spacing.md,
    justifyContent: 'space-between'
  },
  statisticsMetricCardPressed: {
    opacity: 0.78
  },
  statisticsMetricHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  statisticsMetricLabel: {
    marginTop: spacing.sm,
    fontFamily: fonts.bodyStrong,
    color: colors.ink,
    fontSize: 14
  },
  statisticsMetricValue: {
    marginTop: 2,
    fontFamily: fonts.heading,
    fontSize: 29
  },
  statisticsMetricHint: {
    marginTop: 2,
    fontFamily: fonts.body,
    color: colors.muted,
    fontSize: 11,
    lineHeight: 15
  },
  requestsPanel: {
    gap: spacing.sm
  },
  requestsTabRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.xs,
    borderRadius: radius.lg,
    backgroundColor: colors.cardDeep
  },
  requestsTab: {
    flex: 1,
    minHeight: 42,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm
  },
  requestsTabActive: {
    backgroundColor: colors.white
  },
  requestsTabText: {
    fontFamily: fonts.bodyStrong,
    color: colors.muted,
    fontSize: 13,
    textAlign: 'center'
  },
  requestsTabTextActive: {
    color: colors.ink
  },
  sectionNavCard: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
    ...shadow
  },
  sectionNavBackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs
  },
  sectionNavBackText: {
    fontFamily: fonts.bodyStrong,
    color: colors.accent,
    fontSize: 13
  },
  sectionNavTitle: {
    fontFamily: fonts.displaySoft,
    fontSize: 18,
    color: colors.ink
  },
  sectionNavText: {
    marginTop: 4,
    fontFamily: fonts.body,
    color: colors.muted,
    fontSize: 13
  },
  cardTitle: {
    fontFamily: fonts.displaySoft,
    fontSize: 18,
    color: colors.ink,
    marginBottom: spacing.sm
  },
  cardTitleSmallPhone: {
    fontSize: 16,
    lineHeight: 20,
    marginBottom: spacing.xs
  },
  titleGuideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm
  },
  titleGuideRowCentered: {
    justifyContent: 'center'
  },
  titleGuideTitleReset: {
    marginBottom: 0
  },
  guideIconButton: {
    width: 28,
    height: 28,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center'
  },
  menuCardTitle: {
    fontFamily: fonts.displaySoft,
    fontSize: 18,
    color: colors.ink,
    marginBottom: spacing.md,
    textAlign: 'center'
  },
  menuToggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    marginBottom: spacing.sm
  },
  menuToggleButtonPdf: {
    backgroundColor: colors.accent
  },
  menuToggleButtonKi: {
    backgroundColor: colors.accentWarm
  },
  menuToggleButtonKiSpacing: {
    marginTop: spacing.md
  },
  menuToggleButtonLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
    minWidth: 0,
    paddingRight: spacing.sm
  },
  menuToggleButtonText: {
    fontFamily: fonts.bodyStrong,
    color: colors.white,
    flexShrink: 1
  },
  sectionCardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm
  },
  sectionCardTitle: {
    fontFamily: fonts.displaySoft,
    fontSize: 18,
    color: colors.ink
  },
  sectionCardTitleSmallPhone: {
    fontSize: 16
  },
  pendingCountBadge: {
    marginLeft: 'auto',
    minWidth: 22,
    height: 22,
    borderRadius: 999,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent
  },
  pendingCountBadgeText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 12,
    color: colors.white
  },
  ordersCard: {
    borderLeftWidth: 4,
    borderLeftColor: colors.accentCool
  },
  reservationsCard: {
    borderLeftWidth: 4,
    borderLeftColor: colors.accentWarm
  },
  reviewsDashboardCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B'
  },
  reviewDashboardRow: {
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    gap: 4
  },
  reviewDashboardText: {
    fontFamily: fonts.body,
    color: colors.ink,
    lineHeight: 19
  },
  reviewDashboardLink: {
    marginTop: spacing.xs,
    fontFamily: fonts.bodyStrong,
    color: colors.accent
  },
  profileCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: spacing.lg,
    ...shadow
  },
  profileLine: {
    fontFamily: fonts.body,
    color: colors.ink,
    marginBottom: spacing.xs
  },
  panelScreenHeader: {
    marginBottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm
  },
  panelScreenHeaderSmallPhone: {
    marginBottom: spacing.xs
  },
  panelScreenTitle: {
    flex: 1,
    fontFamily: fonts.displaySoft,
    fontSize: 18,
    lineHeight: 22,
    color: colors.accent
  },
  panelScreenTitleSmallPhone: {
    fontSize: 16,
    lineHeight: 20
  },
  panelScreenCard: {
    marginTop: 0
  },
  panelScreenCardSmallPhone: {
    marginBottom: 0
  },
  offersPanelIntro: {
    marginBottom: spacing.md,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted
  },
  offerAccordionHeader: {
    minHeight: 60,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    ...shadow
  },
  offerAccordionHeaderActive: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(0,188,212,0.08)'
  },
  offerAccordionTitleRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm
  },
  offerAccordionTitle: {
    flexShrink: 1,
    fontFamily: fonts.bodyStrong,
    fontSize: 15,
    color: colors.ink
  },
  offerAccordionCountBadge: {
    minWidth: 25,
    height: 25,
    paddingHorizontal: 7,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent
  },
  offerAccordionCountText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 12,
    color: colors.white
  },
  composerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  composerHeaderPressed: {
    opacity: 0.86
  },
  composerHint: {
    fontFamily: fonts.body,
    color: colors.muted
  },
  composerBody: {
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.line
  },
  panelComposerBody: {
    marginTop: 0,
    paddingTop: 0,
    borderTopWidth: 0
  },
  helperText: {
    fontFamily: fonts.body,
    color: colors.muted,
    marginTop: spacing.sm,
    lineHeight: 20
  },
  helperTextSmallPhone: {
    marginTop: spacing.xs,
    fontSize: 13,
    lineHeight: 18
  },
  sectionLabel: {
    fontFamily: fonts.bodyStrong,
    color: colors.muted,
    marginTop: spacing.sm,
    marginBottom: spacing.sm
  },
  sectionLabelSmallPhone: {
    fontSize: 12,
    marginTop: spacing.xs,
    marginBottom: spacing.xs
  },
  input: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontFamily: fonts.body,
    fontSize: 15,
    marginBottom: spacing.md
  },
  authInput: {
    color: colors.ink
  },
  passwordFieldWrap: {
    position: 'relative'
  },
  passwordAuthFieldWrap: {
    marginBottom: spacing.md
  },
  passwordAuthFieldWrapSmallPhone: {
    marginBottom: spacing.sm
  },
  passwordInput: {
    marginBottom: 0,
    paddingRight: 50
  },
  passwordVisibilityButton: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center'
  },
  inputSmallPhone: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: spacing.sm
  },
  registerLookupHint: {
    marginTop: -spacing.xs,
    marginBottom: spacing.xs,
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted
  },
  registerLookupError: {
    marginTop: -spacing.xs,
    marginBottom: spacing.xs,
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.accentWarm
  },
  citySuggestionsCard: {
    marginTop: -spacing.xs,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    overflow: 'hidden'
  },
  citySuggestionRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.line
  },
  citySuggestionTitle: {
    fontFamily: fonts.bodyStrong,
    color: colors.ink
  },
  citySuggestionMeta: {
    marginTop: 2,
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted
  },
  registerLogoPreview: {
    width: 92,
    height: 92,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: spacing.sm
  },
  registerMenuUploadCard: {
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.cardDeep,
    padding: spacing.sm,
    gap: spacing.xs
  },
  registerMenuUploadActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs
  },
  settingsLogoPreview: {
    width: 92,
    height: 92,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: spacing.sm
  },
  settingsLogoFallback: {
    width: 92,
    height: 92,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm
  },
  settingsLogoFallbackImage: {
    width: 72,
    height: 72,
    borderRadius: 12
  },
  textArea: {
    minHeight: 90,
    textAlignVertical: 'top'
  },
  textAreaSmallPhone: {
    minHeight: 78
  },
  menuItemAllergenInput: {
    minHeight: 84
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: spacing.md
  },
  buttonCompactSmallPhone: {
    marginTop: spacing.sm,
    minHeight: 44,
    paddingVertical: 10
  },
  buttonText: {
    fontFamily: fonts.bodyStrong,
    color: colors.white
  },
  buttonSmall: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: 9,
    alignItems: 'center',
    marginTop: spacing.xs
  },
  buttonSmallDisabled: {
    opacity: 0.65
  },
  buttonSmallText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 13,
    color: colors.white
  },
  outlineButton: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: spacing.md
  },
  outlineButtonDisabled: {
    borderColor: colors.line,
    backgroundColor: colors.page
  },
  outlineButtonText: {
    fontFamily: fonts.bodyStrong,
    color: colors.accent
  },
  outlineButtonTextDisabled: {
    color: colors.muted
  },
  topInlineOutlineButton: {
    marginTop: 0,
    paddingHorizontal: spacing.md
  },
  topInlineOutlineButtonSmallPhone: {
    width: '100%',
    paddingHorizontal: spacing.sm
  },
  inlineButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs
  },
  inlineButtonContentSmallPhone: {
    justifyContent: 'flex-start'
  },
  onboardingHero: {
    marginBottom: spacing.lg,
    gap: spacing.md
  },
  onboardingHeroSmallPhone: {
    marginBottom: 4,
    gap: 4
  },
  onboardingHeroTop: {
    gap: spacing.md
  },
  onboardingHeroTopSmallPhone: {
    gap: 4
  },
  onboardingHeroActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm
  },
  onboardingHeroActionsSmallPhone: {
    flexDirection: 'column',
    gap: spacing.xs
  },
  onboardingHeaderSmallPhone: {
    alignItems: 'flex-start'
  },
  onboardingHeaderTextSmallPhone: {
    minWidth: 0
  },
  onboardingHeroTitleRowDefault: {
    gap: 0
  },
  onboardingHeroTitleRowSmallPhone: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 6
  },
  onboardingHeroTitleTextWrapSmallPhone: {
    flex: 1,
    minWidth: 0
  },
  onboardingHeroActionsInlineSmallPhone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0
  },
  onboardingHomeButtonSmallPhone: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 999,
    backgroundColor: colors.white,
    minHeight: 28,
    paddingHorizontal: spacing.xs,
    paddingVertical: 4,
    justifyContent: 'center',
    ...shadow
  },
  onboardingHomeButtonContentSmallPhone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  onboardingHomeButtonTextSmallPhone: {
    fontFamily: fonts.bodyStrong,
    fontSize: 11,
    lineHeight: 12,
    color: colors.accent
  },
  onboardingLogoutIconButtonSmallPhone: {
    width: 28,
    height: 28,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow
  },
  onboardingHeroEyebrow: {
    fontFamily: fonts.bodyStrong,
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.accent
  },
  onboardingHeroText: {
    marginTop: spacing.xs,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted
  },
  onboardingHeroTextSmallPhone: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 14
  },
  onboardingProgressCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.line,
    ...shadow
  },
  onboardingProgressCardSmallPhone: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.xs,
    paddingVertical: 6
  },
  onboardingProgressHeader: {
    gap: 4,
    marginBottom: spacing.sm
  },
  onboardingProgressStep: {
    fontFamily: fonts.bodyStrong,
    fontSize: 12,
    color: colors.accent
  },
  onboardingProgressTitle: {
    fontFamily: fonts.displaySoft,
    fontSize: 18,
    color: colors.ink
  },
  onboardingProgressTitleSmallPhone: {
    fontSize: 14,
    lineHeight: 16
  },
  onboardingProgressTrack: {
    width: '100%',
    height: 10,
    borderRadius: 999,
    backgroundColor: colors.line,
    overflow: 'hidden'
  },
  onboardingProgressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: colors.accent
  },
  onboardingChoiceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md
  },
  onboardingChoiceGridCompact: {
    flexDirection: 'column'
  },
  onboardingChoiceCard: {
    flex: 1,
    minWidth: 132,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md
  },
  onboardingChoiceCardCompact: {
    minWidth: 0,
    width: '100%'
  },
  onboardingChoiceCardActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft
  },
  onboardingChoiceTitle: {
    fontFamily: fonts.bodyStrong,
    fontSize: 15,
    color: colors.ink
  },
  onboardingChoiceTitleActive: {
    color: colors.accent
  },
  onboardingChoiceText: {
    marginTop: spacing.xs,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted
  },
  onboardingSummaryList: {
    gap: spacing.sm
  },
  onboardingSummaryRow: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 4
  },
  onboardingSummaryLabel: {
    fontFamily: fonts.bodyStrong,
    fontSize: 12,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6
  },
  onboardingSummaryValue: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.ink
  },
  onboardingFooterBar: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    marginTop: spacing.xs,
    marginBottom: spacing.lg
  },
  onboardingFooterBarSmallPhone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 0,
    marginBottom: 0
  },
  onboardingFooterButton: {
    flex: 1,
    marginTop: 0
  },
  onboardingFooterButtonSmallPhone: {
    flex: 1,
    width: 0,
    minHeight: 38,
    paddingHorizontal: 6,
    paddingVertical: 8
  },
  onboardingFooterButtonTextSmallPhone: {
    fontSize: 11,
    lineHeight: 12,
    textAlign: 'center'
  },
  status: {
    fontFamily: fonts.body,
    color: colors.accentCool,
    marginTop: spacing.sm
  },
  draftDirtyStatus: {
    marginTop: spacing.sm,
    fontFamily: fonts.bodyStrong,
    color: colors.accentWarm
  },
  errorText: {
    fontFamily: fonts.body,
    color: colors.accentWarm,
    marginTop: spacing.sm
  },
  toggleGroup: {
    gap: spacing.sm,
    marginBottom: spacing.sm
  },
  mealSlotRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md
  },
  mealSlotRowCompact: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm
  },
  cuisineRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.sm
  },
  cuisineChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
    backgroundColor: colors.white
  },
  cuisineChipActive: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent
  },
  cuisineChipText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 12,
    color: colors.ink
  },
  cuisineChipTextActive: {
    color: colors.ink
  },
  mealSlotChip: {
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line
  },
  mealSlotChipCompact: {
    paddingVertical: 7
  },
  mealSlotChipTiny: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6
  },
  mealSlotChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  mealSlotChipDisabled: {
    opacity: 0.45
  },
  mealSlotChipText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 13,
    color: colors.ink
  },
  mealSlotChipTextCompact: {
    fontSize: 12
  },
  mealSlotChipTextTiny: {
    fontSize: 11
  },
  mealSlotChipTextActive: {
    color: colors.white
  },
  mealSlotChipTextDisabled: {
    color: colors.muted
  },
  toggleRow: {
    width: '100%',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md
  },
  toggleRowCompact: {
    paddingVertical: 8
  },
  toggleRowDisabled: {
    opacity: 0.5
  },
  toggleLabel: {
    fontFamily: fonts.bodyStrong,
    fontSize: 14,
    color: colors.ink
  },
  toggleLabelCompact: {
    fontSize: 13
  },
  toggleTrack: {
    width: 48,
    height: 28,
    borderRadius: 999,
    padding: 3,
    justifyContent: 'center',
    backgroundColor: colors.line
  },
  toggleTrackOn: {
    backgroundColor: colors.accent
  },
  toggleTrackDisabled: {
    backgroundColor: 'rgba(0,0,0,0.18)'
  },
  toggleThumb: {
    width: 22,
    height: 22,
    borderRadius: 999,
    backgroundColor: colors.white
  },
  toggleThumbOn: {
    marginLeft: 20
  },
  preorderOn: {
    backgroundColor: colors.accentCool
  },
  preorderOff: {
    backgroundColor: colors.accentWarm
  },
  imageButton: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    width: '100%',
    minWidth: 0,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: colors.cardDeep,
    marginTop: spacing.xs,
    marginBottom: spacing.md
  },
  imageButtonText: {
    fontFamily: fonts.bodyStrong,
    color: colors.ink,
    flex: 1,
    flexShrink: 1,
    lineHeight: 20
  },
  registerConsentSection: {
    gap: spacing.sm,
    marginBottom: spacing.sm
  },
  registerLegalLinksRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm
  },
  registerLegalLinkButton: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
    backgroundColor: colors.white
  },
  registerLegalLinkText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 12,
    color: colors.accent
  },
  menuCurrentFileText: {
    fontFamily: fonts.bodyStrong,
    color: colors.ink,
    marginBottom: spacing.sm
  },
  menuFileList: {
    marginTop: spacing.sm,
    gap: spacing.xs
  },
  menuFileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    backgroundColor: colors.white
  },
  menuFileName: {
    flex: 1,
    minWidth: 0,
    fontFamily: fonts.body,
    color: colors.ink
  },
  menuFileShowButton: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6
  },
  menuFileShowButtonText: {
    fontFamily: fonts.bodyStrong,
    color: colors.accent,
    fontSize: 12
  },
  digitalMenuPrimaryButton: {
    minHeight: 44,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.accent
  },
  digitalMenuPrimaryButtonDisabled: {
    opacity: 0.62
  },
  digitalMenuPrimaryButtonText: {
    color: colors.accent
  },
  digitalMenuList: {
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    overflow: 'hidden'
  },
  digitalDietFilterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm
  },
  lunchValidityCard: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(0, 188, 212, 0.3)',
    borderRadius: radius.md,
    backgroundColor: 'rgba(0, 188, 212, 0.07)',
    gap: spacing.sm
  },
  lunchValidityHeaderRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm
  },
  lunchValidityHeaderText: {
    flex: 1,
    minWidth: 180
  },
  lunchValidityTitle: {
    fontFamily: fonts.bodyStrong,
    fontSize: 15,
    color: colors.ink
  },
  lunchValiditySummary: {
    marginTop: 2,
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.muted
  },
  lunchValiditySummaryPending: {
    fontFamily: fonts.bodyStrong,
    color: colors.accentWarm
  },
  lunchValidityChangeButton: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
    backgroundColor: colors.white
  },
  lunchValidityChangeButtonText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 12,
    color: colors.accent
  },
  lunchValidityEditorBox: {
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    gap: spacing.sm
  },
  lunchValidityEditorTitle: {
    fontFamily: fonts.bodyStrong,
    fontSize: 14,
    color: colors.ink
  },
  lunchValidityDateRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm
  },
  lunchValidityDateButton: {
    flex: 1,
    minWidth: 130,
    minHeight: 58,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    backgroundColor: colors.white
  },
  lunchValidityDateLabel: {
    fontFamily: fonts.bodyStrong,
    fontSize: 11,
    color: colors.accent,
    textTransform: 'uppercase'
  },
  lunchValidityDateValue: {
    marginTop: 2,
    fontFamily: fonts.bodyStrong,
    fontSize: 13,
    color: colors.ink
  },
  lunchValidityNoEndButton: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    backgroundColor: 'rgba(0, 188, 212, 0.1)'
  },
  lunchValidityNoEndButtonText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 12,
    color: colors.accent
  },
  lunchValidityModalCard: {
    maxHeight: '92%',
    gap: spacing.sm
  },
  lunchValidityInlinePickerCard: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.sm,
    backgroundColor: colors.white
  },
  lunchValidityModalActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs
  },
  lunchValidityModalAction: {
    flex: 1,
    minWidth: 140,
    marginTop: 0
  },
  lunchValidityActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm
  },
  lunchValidityActionButton: {
    flex: 1,
    minWidth: 125,
    marginTop: 0
  },
  lunchValidityInlineApply: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    backgroundColor: colors.accent
  },
  lunchValidityInlineApplyText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 13,
    color: colors.white
  },
  lunchValidityWebDateList: {
    maxHeight: 360,
    marginBottom: spacing.sm
  },
  digitalCategoryBlock: {
    borderBottomWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white
  },
  digitalCategoryTitle: {
    fontFamily: fonts.bodyStrong,
    fontSize: 15,
    color: colors.ink,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.line
  },
  digitalCategoryTitleToneDefault: {
    backgroundColor: colors.cardDeep
  },
  digitalCategoryTitleToneLunch: {
    backgroundColor: 'rgba(0, 188, 212, 0.18)'
  },
  digitalCategoryTitleToneDinner: {
    backgroundColor: 'rgba(249, 115, 22, 0.16)'
  },
  digitalCategoryTitleToneBreakfast: {
    backgroundColor: 'rgba(255, 213, 79, 0.38)'
  },
  digitalCategoryTitleToneKids: {
    backgroundColor: 'rgba(167, 139, 250, 0.20)'
  },
  digitalCategoryTitleToneDessert: {
    backgroundColor: 'rgba(244, 114, 182, 0.18)'
  },
  digitalCategoryTitleToneSalad: {
    backgroundColor: 'rgba(34, 197, 94, 0.18)'
  },
  digitalListRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderColor: colors.line
  },
  digitalListHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm
  },
  digitalListName: {
    flex: 1,
    fontFamily: fonts.bodyStrong,
    color: colors.ink,
    fontSize: 15
  },
  digitalListNameWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs
  },
  menuOfferBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.accentWarm,
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 4
  },
  menuOfferBadgeText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 11,
    color: colors.white
  },
  menuDietBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  menuDietBadgeVegan: {
    backgroundColor: 'rgba(34, 197, 94, 0.18)'
  },
  menuDietBadgeVegetarian: {
    backgroundColor: 'rgba(255, 213, 79, 0.38)'
  },
  menuDietBadgeDrinks: {
    backgroundColor: 'rgba(14, 165, 233, 0.18)'
  },
  menuDietBadgeText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 11,
    color: colors.ink
  },
  digitalListPrice: {
    fontFamily: fonts.bodyStrong,
    color: colors.accent,
    fontSize: 14
  },
  digitalListDescription: {
    marginTop: spacing.xs,
    fontFamily: fonts.body,
    color: colors.muted,
    fontSize: 13
  },
  digitalItemAllergenWrap: {
    marginTop: spacing.xs
  },
  digitalItemAllergenLabel: {
    fontFamily: fonts.bodyStrong,
    fontSize: 12,
    color: colors.muted,
    marginBottom: 4
  },
  digitalItemAllergenRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs
  },
  digitalListEmpty: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    fontFamily: fonts.body,
    color: colors.muted
  },
  digitalAllergenCard: {
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  digitalAllergenInput: {
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    minHeight: 96
  },
  digitalAllergenChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs
  },
  digitalAllergenChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.cardDeep,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5
  },
  digitalAllergenChipText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.ink
  },
  digitalGlobalActions: {
    marginTop: spacing.md
  },
  digitalGlobalActionsRow: {
    flexDirection: 'row',
    gap: spacing.xs
  },
  digitalGlobalActionsRowCompact: {
    gap: 6
  },
  digitalGlobalActionsRowSmallPhone: {
    flexDirection: 'column'
  },
  digitalActionButton: {
    flex: 1,
    minWidth: 0,
    minHeight: 42,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: spacing.xs,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },
  digitalActionButtonCompact: {
    minHeight: 48,
    paddingHorizontal: 6,
    paddingVertical: 6
  },
  digitalActionButtonAdd: {
    backgroundColor: colors.white,
    borderColor: colors.accent
  },
  digitalActionButtonSave: {
    backgroundColor: colors.accent
  },
  digitalActionButtonDelete: {
    backgroundColor: colors.accentWarm
  },
  digitalActionButtonDisabled: {
    opacity: 0.62
  },
  digitalActionButtonText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 12,
    color: colors.white,
    textAlign: 'center',
    flexShrink: 1
  },
  digitalActionButtonTextCompact: {
    fontSize: 11,
    lineHeight: 13
  },
  digitalActionButtonTextAdd: {
    color: colors.accent
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    padding: spacing.sm,
    paddingHorizontal: spacing.lg
  },
  modalBackdropCompact: {
    justifyContent: 'flex-start',
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.sm
  },
  modalBackdropSmallPhone: {
    justifyContent: 'flex-start',
    paddingTop: 0,
    paddingBottom: 0,
    paddingHorizontal: 0
  },
  guideBackdropFullscreen: {
    paddingTop: 0,
    paddingBottom: 0,
    paddingHorizontal: 0
  },
  modalCard: {
    width: '100%',
    maxWidth: 700,
    alignSelf: 'center',
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.line,
    ...shadow
  },
  supportKeyboardView: {
    flex: 1
  },
  supportFullscreenBackdrop: {
    flex: 1,
    backgroundColor: colors.page
  },
  supportChatModal: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    maxWidth: '100%',
    alignSelf: 'stretch',
    padding: 0,
    overflow: 'hidden',
    backgroundColor: colors.white
  },
  supportChatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    backgroundColor: 'rgba(0, 188, 212, 0.05)'
  },
  supportAssistantAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 188, 212, 0.12)'
  },
  supportHeaderTextWrap: {
    flex: 1,
    minWidth: 0
  },
  supportHeaderTitle: {
    fontFamily: fonts.bodyStrong,
    color: colors.ink,
    fontSize: 15
  },
  supportOnlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2
  },
  supportOnlineDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.accentCool
  },
  supportOnlineText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 11,
    color: '#2f855a'
  },
  supportHeaderBackButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line
  },
  supportStartContent: {
    padding: spacing.md,
    gap: spacing.sm
  },
  supportGreetingBubble: {
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: '#f4f8ff',
    borderWidth: 1,
    borderColor: 'rgba(84, 123, 205, 0.16)'
  },
  supportGreetingTitle: {
    fontFamily: fonts.bodyStrong,
    color: colors.ink,
    fontSize: 17,
    lineHeight: 23
  },
  supportGreetingText: {
    marginTop: 5,
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19
  },
  supportAssistantChoice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: 'rgba(0, 188, 212, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(0, 188, 212, 0.22)'
  },
  supportTeamChoice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line
  },
  supportChoiceIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white
  },
  supportChoiceTextWrap: {
    flex: 1,
    minWidth: 0
  },
  supportChoiceTitle: {
    fontFamily: fonts.bodyStrong,
    color: colors.ink,
    fontSize: 14
  },
  supportChoiceText: {
    marginTop: 2,
    fontFamily: fonts.body,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17
  },
  supportAssistantContent: {
    flex: 1,
    minHeight: 0
  },
  supportMessageScroll: {
    flex: 1,
    minHeight: 0
  },
  supportMessageScrollContent: {
    padding: spacing.md,
    gap: spacing.sm
  },
  supportBubble: {
    maxWidth: '90%',
    borderRadius: radius.md,
    padding: spacing.sm
  },
  supportAssistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line
  },
  supportUserBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#5f86d7'
  },
  supportBubbleTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 4
  },
  supportBubbleTitle: {
    fontFamily: fonts.bodyStrong,
    color: colors.ink,
    fontSize: 12
  },
  supportBubbleText: {
    color: colors.ink,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20
  },
  supportUserBubbleText: {
    color: colors.white
  },
  supportQuickActionWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginBottom: spacing.xs
  },
  supportQuickAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderWidth: 1
  },
  supportQuickActionBlue: {
    backgroundColor: 'rgba(84, 123, 205, 0.12)',
    borderColor: 'rgba(84, 123, 205, 0.22)'
  },
  supportQuickActionGreen: {
    backgroundColor: 'rgba(71, 157, 107, 0.13)',
    borderColor: 'rgba(71, 157, 107, 0.24)'
  },
  supportQuickActionOrange: {
    backgroundColor: 'rgba(249, 115, 22, 0.13)',
    borderColor: 'rgba(249, 115, 22, 0.24)'
  },
  supportQuickActionText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 11,
    color: colors.ink
  },
  supportChatMuted: {
    fontFamily: fonts.body,
    color: colors.muted,
    textAlign: 'center',
    paddingVertical: spacing.sm
  },
  supportStepsCard: {
    marginTop: spacing.sm,
    gap: 7,
    padding: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: '#f5f7fb'
  },
  supportStepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7
  },
  supportStepNumber: {
    width: 19,
    height: 19,
    borderRadius: 10,
    overflow: 'hidden',
    textAlign: 'center',
    backgroundColor: colors.accent,
    color: colors.white,
    fontFamily: fonts.bodyStrong,
    fontSize: 11,
    lineHeight: 19
  },
  supportStepText: {
    flex: 1,
    color: colors.ink,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18
  },
  supportActionButton: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.accent
  },
  supportActionButtonText: {
    color: colors.white,
    fontFamily: fonts.bodyStrong,
    fontSize: 13
  },
  supportTeamInlineButton: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.accent,
    paddingHorizontal: spacing.sm,
    paddingVertical: 7
  },
  supportTeamInlineText: {
    color: colors.accent,
    fontFamily: fonts.bodyStrong,
    fontSize: 12
  },
  supportErrorRow: {
    gap: 6,
    paddingVertical: spacing.xs
  },
  supportRetryText: {
    color: colors.accent,
    fontFamily: fonts.bodyStrong,
    fontSize: 13
  },
  supportInputArea: {
    padding: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.white
  },
  supportInputPill: {
    minHeight: 46,
    maxHeight: 104,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.xs,
    borderRadius: 24,
    paddingLeft: spacing.md,
    paddingRight: 5,
    paddingVertical: 5,
    backgroundColor: '#f4f6fa',
    borderWidth: 1,
    borderColor: colors.line
  },
  supportChatInput: {
    flex: 1,
    minHeight: 34,
    maxHeight: 84,
    paddingTop: 7,
    paddingBottom: 6,
    color: colors.ink,
    fontFamily: fonts.body,
    fontSize: 14,
    textAlignVertical: 'center'
  },
  supportSendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent
  },
  supportSendButtonDisabled: {
    opacity: 0.4
  },
  supportTeamContent: {
    padding: spacing.md,
    gap: spacing.sm,
    paddingBottom: spacing.xl
  },
  supportTeamScroll: {
    flex: 1,
    minHeight: 0
  },
  supportTeamTitle: {
    fontFamily: fonts.bodyStrong,
    fontSize: 18,
    color: colors.ink
  },
  supportTeamIntro: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
    color: colors.muted
  },
  supportTeamInput: {
    minHeight: 170,
    textAlignVertical: 'top'
  },
  supportTeamSendButton: {
    marginTop: spacing.xs
  },
  guideModalCard: {
    maxWidth: 560,
    overflow: 'hidden'
  },
  guideModalCardFullscreen: {
    flex: 1,
    width: '100%',
    maxWidth: '100%',
    alignSelf: 'stretch',
    height: '100%',
    maxHeight: '100%',
    borderRadius: 0,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md
  },
  modalCardCompact: {
    borderRadius: radius.md,
    padding: spacing.md
  },
  modalCardSmallPhone: {
    flex: 1,
    width: '100%',
    maxWidth: '100%',
    alignSelf: 'stretch',
    height: '100%',
    maxHeight: '100%',
    borderRadius: 0,
    padding: spacing.sm
  },
  timePickerBackdrop: {
    justifyContent: 'flex-end'
  },
  timePickerModalCard: {
    maxWidth: 420,
    paddingBottom: spacing.md
  },
  timePickerModalTitle: {
    fontFamily: fonts.bodyStrong,
    fontSize: 16,
    color: colors.ink,
    marginBottom: spacing.sm
  },
  timePickerSpinner: {
    alignSelf: 'stretch'
  },
  timePickerModalActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm
  },
  timePickerModalActionButton: {
    flex: 1,
    marginTop: 0
  },
  eventPickerBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.62)'
  },
  eventPickerModalCard: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.lg,
    backgroundColor: colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 12
  },
  eventPickerModalTitle: {
    fontFamily: fonts.bodyStrong,
    fontSize: 17,
    color: colors.ink,
    marginBottom: spacing.sm
  },
  eventPickerSpinner: {
    alignSelf: 'stretch',
    backgroundColor: colors.white
  },
  eventPickerModalActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md
  },
  eventPickerModalActionButton: {
    flex: 1,
    marginTop: 0
  },
  modalScrollContent: {
    paddingBottom: spacing.sm
  },
  modalScrollContentSmallPhone: {
    paddingBottom: spacing.sm
  },
  mobileViewportShell: {
    flex: 1,
    minHeight: 0,
    maxHeight: '100%'
  },
  mobileViewportHeader: {
    paddingHorizontal: spacing.sm,
    paddingTop: 4,
    paddingBottom: 4
  },
  mobileViewportBody: {
    flex: 1,
    minHeight: 0,
    ...Platform.select({
      web: {
        overflowX: 'hidden',
        overflowY: 'auto'
      }
    })
  },
  mobileViewportBodyContent: {
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
    flexGrow: 1
  },
  onboardingViewportBodyContent: {
    paddingTop: 4
  },
  mobileViewportFooter: {
    paddingHorizontal: spacing.sm,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.bgBottom
  },
  onboardingViewportFooterSmallPhone: {
    paddingHorizontal: spacing.xs,
    paddingTop: 4
  },
  guideHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm
  },
  guideHeaderRowCompact: {
    gap: spacing.xs
  },
  guideHeaderTextWrap: {
    flex: 1
  },
  guideEyebrow: {
    fontFamily: fonts.bodyStrong,
    fontSize: 12,
    color: colors.accent,
    marginBottom: 2,
    textTransform: 'uppercase'
  },
  guideCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card
  },
  guideCloseButtonCompact: {
    width: 34,
    height: 34
  },
  guideTitleCompact: {
    fontSize: 16,
    lineHeight: 22
  },
  guideIntro: {
    marginTop: spacing.sm,
    fontFamily: fonts.body,
    color: colors.muted,
    lineHeight: 21
  },
  guideIntroCompact: {
    marginTop: spacing.xs,
    fontSize: 14,
    lineHeight: 21
  },
  guideBodyScroll: {
    marginTop: spacing.md
  },
  guideBodyScrollFullscreen: {
    flex: 1,
    minHeight: 0,
    maxHeight: '100%',
    marginTop: spacing.sm,
    ...Platform.select({
      web: {
        overflowX: 'hidden',
        overflowY: 'auto'
      }
    })
  },
  guideBodyScrollContent: {
    paddingBottom: spacing.xs
  },
  guideBodyScrollContentFullscreen: {
    paddingBottom: spacing.sm
  },
  guideStepList: {
    marginTop: spacing.md,
    gap: spacing.sm
  },
  guideStepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm
  },
  guideStepBadge: {
    width: 24,
    height: 24,
    borderRadius: 999,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1
  },
  guideStepBadgeText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 12,
    color: colors.accent
  },
  guideStepText: {
    flex: 1,
    fontFamily: fonts.body,
    color: colors.ink,
    lineHeight: 21
  },
  guidePrimaryButton: {
    marginTop: spacing.lg
  },
  onboardingModalCard: {
    maxWidth: 620
  },
  onboardingEyebrow: {
    fontFamily: fonts.bodyStrong,
    fontSize: 12,
    color: colors.accentWarm,
    textTransform: 'uppercase',
    marginBottom: spacing.xs
  },
  onboardingIntro: {
    marginTop: spacing.sm,
    fontFamily: fonts.body,
    color: colors.muted,
    lineHeight: 21
  },
  onboardingIntroSmallPhone: {
    fontSize: 13,
    lineHeight: 18
  },
  onboardingStepList: {
    marginTop: spacing.md,
    gap: spacing.sm
  },
  onboardingStepCard: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.cardDeep
  },
  onboardingStepBadge: {
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: colors.accentWarm,
    alignItems: 'center',
    justifyContent: 'center'
  },
  onboardingStepBadgeText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 12,
    color: colors.white
  },
  onboardingStepContent: {
    flex: 1
  },
  onboardingStepTitle: {
    fontFamily: fonts.bodyStrong,
    color: colors.ink,
    marginBottom: 2
  },
  onboardingStepText: {
    fontFamily: fonts.body,
    color: colors.muted,
    lineHeight: 20
  },
  onboardingActions: {
    marginTop: spacing.lg
  },
  onboardingLaterButton: {
    alignSelf: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    marginTop: spacing.xs
  },
  onboardingLaterButtonText: {
    fontFamily: fonts.bodyStrong,
    color: colors.muted
  },
  menuPathCard: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white
  },
  menuWorkspaceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xs
  },
  menuWorkspaceHeaderShell: {
    marginBottom: spacing.sm,
    backgroundColor: '#F6F8FB'
  },
  menuSegmentedTabs: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    borderRadius: 16,
    backgroundColor: '#E9EDF4'
  },
  menuSegmentedTab: {
    flex: 1,
    minWidth: 0,
    minHeight: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingHorizontal: 6
  },
  menuSegmentedTabActive: {
    backgroundColor: colors.white,
    ...shadow
  },
  menuSegmentedTabText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 11,
    color: '#71809A'
  },
  menuSegmentedTabTextActive: {
    color: '#263B5C'
  },
  menuSaveStatusBar: {
    minHeight: 46,
    marginTop: spacing.xs,
    paddingLeft: spacing.sm,
    paddingRight: 5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
    borderRadius: 14
  },
  menuSaveStatusSaved: {
    backgroundColor: '#EAF6ED'
  },
  menuSaveStatusDirty: {
    backgroundColor: '#FFF2E4'
  },
  menuSaveStatusCopy: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7
  },
  menuSaveStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4E9D69'
  },
  menuSaveStatusDotDirty: {
    backgroundColor: '#E98725'
  },
  menuSaveStatusText: {
    flex: 1,
    fontFamily: fonts.bodyStrong,
    fontSize: 12,
    color: '#3E8056'
  },
  menuSaveStatusTextDirty: {
    color: '#A65C13'
  },
  menuStickySaveButton: {
    minHeight: 36,
    borderRadius: 11,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    backgroundColor: colors.accent
  },
  menuStickySaveButtonDisabled: {
    backgroundColor: '#B8C4D7'
  },
  menuStickySaveButtonText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 12,
    color: colors.white
  },
  menuUndoBar: {
    marginTop: spacing.xs,
    minHeight: 42,
    paddingHorizontal: spacing.sm,
    borderRadius: 13,
    backgroundColor: '#263B5C',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  menuUndoText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.white
  },
  menuUndoAction: {
    fontFamily: fonts.bodyStrong,
    fontSize: 12,
    color: '#A8D8FF'
  },
  menuBreakfastHint: {
    marginTop: spacing.xs,
    fontFamily: fonts.body,
    fontSize: 12,
    color: '#71809A'
  },
  menuWorkspaceBackButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: '#E0E7F0'
  },
  menuWorkspaceHeaderText: {
    flex: 1,
    minWidth: 0
  },
  menuWorkspaceDate: {
    fontFamily: fonts.body,
    color: '#91A0BB',
    fontSize: 12
  },
  menuWorkspaceTitle: {
    fontFamily: fonts.heading,
    color: '#1B2D4A',
    fontSize: 22,
    marginTop: -1
  },
  menuWorkspaceHeaderIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E9EFFC'
  },
  menuWorkspaceHeaderIconLunch: {
    backgroundColor: '#E7F4E9'
  },
  menuSelectorShell: {
    padding: spacing.md,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: '#DDE5EF',
    backgroundColor: '#F7F9FC'
  },
  menuSelectorTitle: {
    fontFamily: fonts.heading,
    color: '#1B2D4A',
    fontSize: 24
  },
  menuSelectorText: {
    marginTop: 3,
    marginBottom: spacing.md,
    fontFamily: fonts.body,
    color: '#71809A',
    fontSize: 13,
    lineHeight: 18
  },
  menuSelectorCard: {
    minHeight: 82,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: 18,
    padding: spacing.sm,
    marginBottom: spacing.sm
  },
  menuSelectorCardRegular: {
    backgroundColor: '#ECF1FB'
  },
  menuSelectorCardLunch: {
    backgroundColor: '#EAF6ED'
  },
  menuSelectorIcon: {
    width: 45,
    height: 45,
    borderRadius: 14,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center'
  },
  menuSelectorCopy: {
    flex: 1,
    minWidth: 0
  },
  menuSelectorCardTitle: {
    fontFamily: fonts.bodyStrong,
    color: '#263B5C',
    fontSize: 15
  },
  menuSelectorCardText: {
    marginTop: 2,
    fontFamily: fonts.body,
    color: '#71809A',
    fontSize: 12,
    lineHeight: 16
  },
  menuSelectorFileCard: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: 17,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: '#E0E7F0'
  },
  menuOverviewShell: {
    padding: spacing.md,
    marginBottom: spacing.md,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#DDE5EF',
    backgroundColor: '#F6F8FB'
  },
  menuOverviewGrid: {
    flexDirection: 'row',
    gap: spacing.sm
  },
  menuOverviewScanTile: {
    flex: 0.96,
    minHeight: 192,
    borderRadius: 19,
    padding: spacing.md,
    justifyContent: 'space-between',
    overflow: 'hidden'
  },
  menuPickerDisabled: {
    opacity: 0.5
  },
  menuOverviewDecorCircle: {
    position: 'absolute',
    width: 94,
    height: 94,
    borderRadius: 47,
    right: -27,
    top: -30,
    backgroundColor: 'rgba(255,255,255,0.15)'
  },
  menuOverviewScanTitle: {
    fontFamily: fonts.bodyStrong,
    color: colors.white,
    fontSize: 16,
    lineHeight: 20
  },
  menuOverviewScanText: {
    marginTop: 2,
    fontFamily: fonts.body,
    color: 'rgba(255,255,255,0.92)',
    fontSize: 12,
    lineHeight: 16
  },
  menuOverviewSideColumn: {
    flex: 1.04,
    gap: spacing.sm
  },
  menuOverviewActionTile: {
    flex: 1,
    minHeight: 92,
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#DFE6EF',
    backgroundColor: colors.white
  },
  menuOverviewActionIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  menuOverviewActionText: {
    flex: 1,
    minWidth: 0
  },
  menuOverviewActionTitle: {
    fontFamily: fonts.bodyStrong,
    color: '#263B5C',
    fontSize: 15,
    lineHeight: 19
  },
  menuOverviewActionCaption: {
    marginTop: 3,
    fontFamily: fonts.body,
    color: '#71809A',
    fontSize: 12,
    lineHeight: 16
  },
  menuOverviewBottomRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm
  },
  menuOverviewMetricTile: {
    flex: 1,
    minHeight: 104,
    padding: spacing.md,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#DFE6EF',
    backgroundColor: colors.white
  },
  menuOverviewAnalyticsActionTile: {
    justifyContent: 'space-between'
  },
  menuOverviewAnalyticsActionTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  menuOverviewAnalyticsActionTitle: {
    marginTop: 4,
    fontFamily: fonts.bodyStrong,
    fontSize: 15,
    lineHeight: 19
  },
  menuWorkspaceContent: {
    marginTop: spacing.md
  },
  menuLegacyActionHidden: {
    display: 'none'
  },
  menuDeleteTextLink: {
    alignSelf: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm
  },
  menuDeleteTextLinkText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 13,
    color: colors.accentWarm
  },
  menuFlowBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(22, 34, 52, 0.46)'
  },
  menuFlowSheet: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: colors.white
  },
  menuFlowHandle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    marginBottom: spacing.md,
    backgroundColor: '#D6DEE9'
  },
  menuFlowTitle: {
    fontFamily: fonts.heading,
    fontSize: 20,
    color: '#1B2D4A'
  },
  menuFlowSubtitle: {
    marginTop: 3,
    marginBottom: spacing.md,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    color: '#71809A'
  },
  menuFlowOption: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
    padding: spacing.sm,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#DFE6EF',
    backgroundColor: colors.white
  },
  menuFlowOptionFeatured: {
    borderColor: colors.accent,
    backgroundColor: '#EAFBFC'
  },
  menuFlowOptionDanger: {
    borderColor: '#F2B56D',
    backgroundColor: '#FFF3E6'
  },
  menuFlowOptionIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F4F7FB'
  },
  menuFlowOptionCopy: {
    flex: 1,
    minWidth: 0
  },
  menuFlowOptionTitle: {
    fontFamily: fonts.bodyStrong,
    fontSize: 14,
    color: '#1B2D4A'
  },
  menuFlowOptionTitleDanger: {
    color: '#B56218'
  },
  menuFlowOptionText: {
    marginTop: 2,
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 16,
    color: '#71809A'
  },
  menuFlowBack: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginBottom: spacing.xs
  },
  menuFlowBackText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 13,
    color: colors.accent
  },
  menuFlowCancel: {
    minHeight: 50,
    marginTop: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#DFE6EF'
  },
  menuFlowCancelText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 14,
    color: '#71809A'
  },
  menuDecisionSheet: {
    paddingTop: spacing.lg
  },
  menuDecisionPrimary: {
    minHeight: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent
  },
  menuDecisionPrimaryText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 15,
    color: colors.white
  },
  menuDecisionSecondary: {
    minHeight: 48,
    marginTop: spacing.sm,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#DFE6EF'
  },
  menuDecisionSecondaryText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 14,
    color: '#71809A'
  },
  menuDecisionDanger: {
    minHeight: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentWarm
  },
  menuDecisionDangerText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 15,
    color: colors.white
  },
  menuWorkspaceCloseButton: {
    alignSelf: 'flex-start',
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    backgroundColor: colors.white
  },
  menuWorkspaceCloseButtonRegular: {
    borderColor: '#C8D5F0'
  },
  menuWorkspaceCloseButtonLunch: {
    borderColor: '#BFE0C7'
  },
  menuWorkspaceCloseButtonText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 13
  },
  menuWorkspaceCloseButtonTextRegular: {
    color: '#4A6095'
  },
  menuWorkspaceCloseButtonTextLunch: {
    color: '#3E8056'
  },
  menuOverviewMetricLabel: {
    fontFamily: fonts.body,
    color: '#91A0BB',
    fontSize: 11
  },
  menuOverviewMetricValue: {
    marginTop: 2,
    fontFamily: fonts.heading,
    fontSize: 24
  },
  menuOverviewMetricHint: {
    marginTop: 3,
    fontFamily: fonts.body,
    color: '#71809A',
    fontSize: 11,
    lineHeight: 14
  },
  menuOverviewError: {
    marginTop: spacing.xs,
    fontFamily: fonts.body,
    color: colors.accentWarm,
    fontSize: 12
  },
  menuAnalyticsModal: {
    width: '88%',
    maxWidth: 420,
    borderRadius: 24,
    padding: spacing.lg,
    backgroundColor: colors.white
  },
  menuAnalyticsModalRoot: {
    flex: 1
  },
  menuAnalyticsModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md
  },
  menuAnalyticsModalTitle: {
    fontFamily: fonts.heading,
    color: colors.ink,
    fontSize: 21
  },
  menuAnalyticsModalText: {
    marginTop: 2,
    fontFamily: fonts.body,
    color: colors.muted,
    fontSize: 13
  },
  menuAnalyticsRangeRow: {
    gap: spacing.xs,
    marginBottom: spacing.sm
  },
  menuAnalyticsQuickRangeButton: {
    minHeight: 36,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    borderRadius: 999,
    backgroundColor: '#ECF1FB',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  menuAnalyticsQuickRangeText: {
    fontFamily: fonts.bodyStrong,
    color: '#4A6095',
    fontSize: 12
  },
  menuAnalyticsDateButton: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#DCE4F2',
    backgroundColor: '#F8FAFD',
    paddingHorizontal: spacing.sm,
    justifyContent: 'center'
  },
  menuAnalyticsDateLabel: {
    fontFamily: fonts.bodyStrong,
    color: colors.muted,
    fontSize: 11
  },
  menuAnalyticsDateValue: {
    marginTop: 1,
    fontFamily: fonts.bodyStrong,
    color: colors.ink,
    fontSize: 13
  },
  menuAnalyticsInlinePicker: {
    paddingTop: spacing.xs
  },
  menuAnalyticsInlinePickerTitle: {
    marginTop: spacing.xs,
    fontFamily: fonts.bodyStrong,
    color: colors.ink,
    fontSize: 14,
    textAlign: 'center'
  },
  menuAnalyticsPickerOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(18, 28, 48, 0.3)'
  },
  menuAnalyticsPickerDismissArea: {
    flex: 1
  },
  menuAnalyticsPickerSheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    shadowColor: '#17223A',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 12
  },
  menuAnalyticsPickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm
  },
  menuAnalyticsPickerTitle: {
    fontFamily: fonts.heading,
    color: colors.ink,
    fontSize: 20
  },
  menuAnalyticsPickerSubtitle: {
    marginTop: 2,
    fontFamily: fonts.body,
    color: colors.muted,
    fontSize: 13
  },
  menuAnalyticsPickerCalendar: {
    alignSelf: 'stretch'
  },
  menuAnalyticsPickerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm
  },
  menuAnalyticsPickerCancelButton: {
    flex: 1,
    minHeight: 46,
    borderWidth: 1,
    borderColor: '#C9D4E9',
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center'
  },
  menuAnalyticsPickerCancelText: {
    fontFamily: fonts.bodyStrong,
    color: '#4A6095',
    fontSize: 14
  },
  menuAnalyticsPickerConfirmButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentCool
  },
  menuAnalyticsPickerConfirmText: {
    fontFamily: fonts.bodyStrong,
    color: colors.white,
    fontSize: 14
  },
  menuAnalyticsDayRow: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#EDF1F5'
  },
  menuAnalyticsDayLabel: {
    fontFamily: fonts.body,
    color: colors.ink,
    fontSize: 14
  },
  menuAnalyticsDayValue: {
    fontFamily: fonts.heading,
    color: '#6176A8',
    fontSize: 18
  },
  menuAnalyticsDetailSection: {
    marginTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: '#E6EBF3',
    paddingTop: spacing.sm
  },
  menuAnalyticsDetailTitle: {
    marginBottom: spacing.xs,
    fontFamily: fonts.bodyStrong,
    color: colors.ink,
    fontSize: 14
  },
  menuAnalyticsDetailRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#EDF1F5'
  },
  menuAnalyticsDetailName: {
    flex: 1,
    minWidth: 0,
    fontFamily: fonts.body,
    color: colors.ink,
    fontSize: 13,
    lineHeight: 18
  },
  menuAnalyticsDetailValue: {
    minWidth: 26,
    textAlign: 'right',
    fontFamily: fonts.heading,
    color: '#7A5DB8',
    fontSize: 17
  },
  menuAnalyticsEmptyText: {
    fontFamily: fonts.body,
    color: colors.muted,
    fontSize: 13,
    paddingVertical: spacing.sm
  },
  menuPathCardSmallPhone: {
    marginTop: spacing.sm,
    padding: spacing.sm
  },
  menuHubCard: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    overflow: 'hidden'
  },
  menuHubCardRegular: {
    backgroundColor: '#EAF2FE'
  },
  menuHubCardLunch: {
    backgroundColor: '#EAF6ED'
  },
  menuHubHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm
  },
  menuHubIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center'
  },
  menuHubIconRegular: {
    backgroundColor: colors.white
  },
  menuHubIconLunch: {
    backgroundColor: colors.white
  },
  menuHubTextWrap: {
    flex: 1,
    minWidth: 0
  },
  menuHubTitle: {
    fontFamily: fonts.bodyStrong,
    fontSize: 17,
    color: colors.white
  },
  menuHubTitleLunch: {
    color: '#34734B'
  },
  menuHubTitleRegular: {
    color: '#416BAE'
  },
  menuHubDescription: {
    marginTop: 2,
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 16,
    color: 'rgba(255,255,255,0.88)'
  },
  menuHubDescriptionLunch: {
    color: '#5A8768'
  },
  menuHubDescriptionRegular: {
    color: '#7189B5'
  },
  menuHubKiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: 'rgba(255,255,255,0.24)'
  },
  menuHubKiBadgeLunch: {
    backgroundColor: colors.white
  },
  menuHubKiBadgeRegular: {
    backgroundColor: colors.white
  },
  menuHubKiBadgeText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 11,
    color: colors.white
  },
  menuHubKiBadgeTextLunch: {
    color: '#34734B'
  },
  menuHubKiBadgeTextRegular: {
    color: '#527DCC'
  },
  menuHubOpenButton: {
    minHeight: 42,
    marginTop: spacing.md,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.white
  },
  menuHubOpenButtonRegular: {
    backgroundColor: '#6D96DD'
  },
  menuHubOpenButtonLunch: {
    backgroundColor: '#70AD86'
  },
  menuHubOpenButtonText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 14
  },
  menuHubOpenButtonTextRegular: {
    color: colors.white
  },
  menuHubOpenButtonTextLunch: {
    color: colors.white
  },
  menuPathCardPrimary: {
    backgroundColor: 'rgba(249, 115, 22, 0.06)',
    borderColor: 'rgba(249, 115, 22, 0.18)'
  },
  menuPathCardSecondary: {
    backgroundColor: colors.cardDeep
  },
  menuPathHeader: {
    gap: spacing.xs
  },
  menuPathBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4
  },
  menuPathBadgePrimary: {
    backgroundColor: 'rgba(249, 115, 22, 0.18)'
  },
  menuPathBadgeSecondary: {
    backgroundColor: 'rgba(31, 25, 19, 0.08)'
  },
  menuPathBadgeText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 11,
    color: colors.ink
  },
  menuPathTitle: {
    fontFamily: fonts.displaySoft,
    fontSize: 18,
    color: colors.ink
  },
  menuPathTitleSmallPhone: {
    fontSize: 16,
    lineHeight: 20
  },
  menuPathDescription: {
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
    fontFamily: fonts.body,
    color: colors.muted,
    lineHeight: 20
  },
  menuPathDescriptionSmallPhone: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: spacing.xs
  },
  menuPrimaryInfoText: {
    marginBottom: spacing.sm,
    fontFamily: fonts.bodyStrong,
    color: colors.ink,
    lineHeight: 20
  },
  menuToggleButtonPrimary: {
    marginTop: spacing.xs
  },
  menuToggleButtonSecondary: {
    marginTop: spacing.xs,
    backgroundColor: colors.muted
  },
  menuToggleButtonSmallPhone: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 10
  },
  settingsSection: {
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    backgroundColor: colors.cardDeep,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  settingsSectionSmallPhone: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm
  },
  settingsSectionLabel: {
    fontFamily: fonts.bodyStrong,
    color: colors.ink
  },
  settingsModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line
  },
  settingsModalHeaderButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardDeep
  },
  settingsModalTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.displaySoft,
    fontSize: 20,
    color: colors.ink
  },
  settingsNavigationCard: {
    marginTop: spacing.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    backgroundColor: colors.white
  },
  settingsNavigationRow: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    backgroundColor: colors.white
  },
  settingsNavigationRowPressed: {
    backgroundColor: colors.cardDeep
  },
  settingsNavigationIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardDeep
  },
  settingsNavigationText: {
    flex: 1,
    minWidth: 0
  },
  settingsNavigationTitle: {
    fontFamily: fonts.bodyStrong,
    fontSize: 16,
    color: colors.ink
  },
  settingsNavigationDescription: {
    marginTop: 2,
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 16,
    color: colors.muted
  },
  settingsNavigationValue: {
    marginTop: 3,
    fontFamily: fonts.bodyStrong,
    fontSize: 11,
    color: colors.accent
  },
  settingsServiceTabs: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.md,
    padding: 4,
    borderRadius: radius.md,
    backgroundColor: colors.cardDeep,
    borderWidth: 1,
    borderColor: colors.line
  },
  settingsServiceTab: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm
  },
  settingsServiceTabActive: {
    backgroundColor: colors.accent
  },
  settingsServiceTabText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 14,
    color: colors.ink
  },
  settingsServiceTabTextActive: {
    color: colors.white
  },
  settingsEditableField: {
    marginTop: spacing.sm
  },
  settingsEditableFieldHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
    marginBottom: 6
  },
  settingsEditableFieldLabel: {
    flex: 1,
    fontFamily: fonts.bodyStrong,
    fontSize: 12,
    color: colors.muted
  },
  settingsEditableInput: {
    marginTop: 0,
    marginBottom: 0,
    backgroundColor: colors.white
  },
  settingsEditableTextArea: {
    minHeight: 112,
    paddingTop: spacing.sm
  },
  settingsFeedback: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    marginTop: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1
  },
  settingsFeedbackSuccess: {
    backgroundColor: 'rgba(34, 197, 94, 0.08)',
    borderColor: 'rgba(34, 197, 94, 0.3)'
  },
  settingsFeedbackError: {
    backgroundColor: 'rgba(249, 115, 22, 0.08)',
    borderColor: 'rgba(249, 115, 22, 0.32)'
  },
  settingsFeedbackText: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    color: colors.ink
  },
  settingsLogoEmpty: {
    minHeight: 110,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.white
  },
  settingsToggleTextWrap: {
    flex: 1,
    minWidth: 0
  },
  settingsDisabledInfo: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.cardDeep,
    fontFamily: fonts.body,
    lineHeight: 20,
    color: colors.muted
  },
  providerScopeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm
  },
  providerScopeChip: {
    flexGrow: 1,
    flexBasis: 150,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.sm,
    backgroundColor: colors.white,
    gap: 4
  },
  providerScopeChipActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink
  },
  providerScopeChipTitle: {
    fontFamily: fonts.bodyStrong,
    color: colors.ink
  },
  providerScopeChipTitleActive: {
    color: colors.white
  },
  providerScopeChipText: {
    fontFamily: fonts.body,
    color: colors.muted,
    fontSize: 12
  },
  providerScopeChipTextActive: {
    color: 'rgba(255,255,255,0.72)'
  },
  eventSettingsFields: {
    gap: spacing.sm,
    marginTop: spacing.sm
  },
  settingsAccordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs
  },
  settingsToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md
  },
  settingsToggleState: {
    marginTop: spacing.xs,
    fontFamily: fonts.body,
    color: colors.muted,
    fontSize: 12
  },
  settingsSwitchTrack: {
    width: 48,
    height: 28,
    borderRadius: 999,
    padding: 3,
    justifyContent: 'center',
    backgroundColor: colors.line
  },
  settingsSwitchTrackOn: {
    backgroundColor: colors.accent
  },
  settingsSwitchThumb: {
    width: 22,
    height: 22,
    borderRadius: 999,
    backgroundColor: colors.white
  },
  settingsSwitchThumbOn: {
    marginLeft: 20
  },
  settingsHint: {
    fontFamily: fonts.body,
    color: colors.muted,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    lineHeight: 19
  },
  settingsProfileLink: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: -spacing.xs,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.cardDeep
  },
  settingsProfileLinkText: {
    flex: 1,
    minWidth: 0,
    fontFamily: fonts.bodyStrong,
    fontSize: 12,
    color: colors.accent
  },
  settingsCollapsedHint: {
    marginTop: spacing.xs,
    fontFamily: fonts.body,
    color: colors.muted,
    fontSize: 12
  },
  settingsSubCard: {
    marginTop: spacing.md,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm
  },
  settingsSubCardSmallPhone: {
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm
  },
  openingHoursList: {
    marginTop: spacing.sm,
    gap: spacing.sm
  },
  openingGroupCard: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    backgroundColor: colors.card
  },
  openingGroupCardSmallPhone: {
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs
  },
  openingGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm
  },
  openingGroupTitle: {
    fontFamily: fonts.bodyStrong,
    color: colors.ink
  },
  openingGroupRemoveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  openingGroupRemoveText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 12,
    color: colors.accentWarm
  },
  openingGroupDayRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm
  },
  openingGroupTimeRow: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs
  },
  openingGroupTimeRowCompact: {
    flexDirection: 'column',
    alignItems: 'stretch'
  },
  openingGroupTimeInput: {
    minWidth: 0,
    marginBottom: 0,
    paddingVertical: 10
  },
  openingGroupTimeButton: {
    minWidth: 0,
    marginBottom: 0,
    paddingVertical: 10,
    justifyContent: 'center'
  },
  openingGroupTimeButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs
  },
  openingGroupTimeButtonText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 15,
    color: colors.ink
  },
  openingClosedHint: {
    fontFamily: fonts.body,
    color: colors.muted,
    fontSize: 12
  },
  openingInlineTimePickerCard: {
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.white
  },
  openingInlineTimePickerCardSmallPhone: {
    padding: spacing.xs
  },
  openingDayCard: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.white,
    overflow: 'hidden'
  },
  openingDayHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm
  },
  openingDayLabel: {
    flexShrink: 1,
    fontFamily: fonts.bodyStrong,
    color: colors.ink,
    fontSize: 20
  },
  openingDayState: {
    marginTop: 2,
    fontFamily: fonts.body,
    color: colors.muted,
    fontSize: 13
  },
  openingDayToggle: {
    width: 54,
    height: 32,
    borderRadius: 999,
    padding: 3,
    justifyContent: 'center',
    backgroundColor: colors.line
  },
  openingDayToggleOn: {
    backgroundColor: colors.accent
  },
  openingDayToggleThumb: {
    width: 26,
    height: 26,
    borderRadius: 999,
    backgroundColor: colors.white
  },
  openingDayToggleThumbOn: {
    alignSelf: 'flex-end'
  },
  openingDayPeriod: {
    marginTop: spacing.md
  },
  openingDayTimePair: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs
  },
  openingDayTimeButton: {
    flex: 1,
    minHeight: 88,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.page,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm
  },
  openingDayTimeCaption: {
    fontFamily: fonts.bodyStrong,
    fontSize: 12,
    color: colors.muted,
    letterSpacing: 0.4
  },
  openingDayTimeValue: {
    marginTop: 4,
    fontFamily: fonts.bodyStrong,
    fontSize: 24,
    color: colors.ink
  },
  openingDayTimeNextDay: {
    marginTop: 2,
    fontFamily: fonts.bodyStrong,
    fontSize: 11,
    color: colors.muted
  },
  openingDayTimeDivider: {
    fontFamily: fonts.bodyStrong,
    color: colors.muted,
    fontSize: 16
  },
  openingDaySecondTimeButton: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  openingDaySecondTimeText: {
    fontFamily: fonts.bodyStrong,
    color: colors.accent,
    fontSize: 15
  },
  openingDayRemovePauseButton: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  openingDayRemovePauseText: {
    fontFamily: fonts.bodyStrong,
    color: colors.accentWarm,
    fontSize: 15
  },
  openingGuestSummaryCard: {
    borderRadius: radius.lg,
    backgroundColor: colors.accentSoft,
    padding: spacing.md,
    gap: 4
  },
  openingGuestSummaryEyebrow: {
    marginBottom: 4,
    fontFamily: fonts.bodyStrong,
    color: colors.accent,
    letterSpacing: 0.5,
    fontSize: 12
  },
  openingGuestSummaryText: {
    fontFamily: fonts.body,
    color: colors.ink,
    fontSize: 14,
    lineHeight: 20
  },
  openingTimeSheetBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.58)'
  },
  openingTimeSheet: {
    width: '100%',
    maxHeight: '82%',
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm
  },
  openingTimeSheetHandle: {
    alignSelf: 'center',
    width: 48,
    height: 4,
    borderRadius: 999,
    backgroundColor: colors.line,
    marginBottom: spacing.md
  },
  openingTimeSheetTitle: {
    fontFamily: fonts.bodyStrong,
    fontSize: 25,
    color: colors.ink
  },
  openingTimeSheetSubtitle: {
    marginTop: 2,
    marginBottom: spacing.md,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.muted
  },
  openingTimeSheetScroll: {
    flexGrow: 0
  },
  openingTimeSheetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingBottom: spacing.md
  },
  openingTimeOption: {
    width: '30.9%',
    minHeight: 66,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    paddingHorizontal: 4,
    paddingVertical: spacing.xs
  },
  openingTimeOptionSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  openingTimeOptionText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 19,
    color: colors.ink
  },
  openingTimeOptionTextSelected: {
    color: colors.white
  },
  openingTimeOptionHint: {
    marginTop: 1,
    fontFamily: fonts.bodyStrong,
    fontSize: 10,
    color: colors.muted
  },
  openingTimeOptionHintSelected: {
    color: colors.white
  },
  openingTimeSheetCancel: {
    marginTop: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md
  },
  openingTimeSheetCancelText: {
    fontFamily: fonts.bodyStrong,
    color: colors.muted,
    fontSize: 16
  },
  openingDayStatus: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    backgroundColor: colors.white
  },
  openingDayStatusOn: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft
  },
  openingDayStatusText: {
    fontFamily: fonts.bodyStrong,
    color: colors.muted,
    fontSize: 12
  },
  openingDayStatusTextOn: {
    color: colors.accent
  },
  openingTimeRow: {
    marginTop: spacing.sm,
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: spacing.xs,
    width: '100%'
  },
  openingTimeInput: {
    width: '100%',
    minWidth: 0,
    marginBottom: 0,
    paddingVertical: 10
  },
  openingTimeDivider: {
    alignSelf: 'center',
    fontFamily: fonts.body,
    color: colors.muted,
    fontSize: 12
  },
  specialClosureCard: {
    marginTop: spacing.md,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.card
  },
  specialClosureCardSmallPhone: {
    padding: spacing.xs
  },
  specialClosureDateButton: {
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.sm,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs
  },
  specialClosureDateButtonText: {
    flex: 1,
    fontFamily: fonts.bodyStrong,
    color: colors.ink
  },
  specialClosureDateButtonPlaceholder: {
    color: colors.muted
  },
  specialClosureInlinePicker: {
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    backgroundColor: colors.page,
    padding: spacing.xs
  },
  specialClosureInlineScroll: {
    maxHeight: 260
  },
  specialClosureList: {
    marginTop: spacing.sm,
    gap: spacing.xs
  },
  specialClosureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.white
  },
  specialClosureRowSmallPhone: {
    flexDirection: 'column',
    alignItems: 'stretch'
  },
  specialClosureTextWrap: {
    flex: 1,
    gap: 2
  },
  specialClosureDateText: {
    fontFamily: fonts.bodyStrong,
    color: colors.ink
  },
  specialClosureReasonText: {
    fontFamily: fonts.body,
    color: colors.muted,
    lineHeight: 19
  },
  specialClosureRemoveButton: {
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(220, 38, 38, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.18)'
  },
  specialClosureEmpty: {
    marginTop: spacing.sm,
    fontFamily: fonts.body,
    color: colors.muted,
    fontSize: 13
  },
  reservationExternalCard: {
    marginTop: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white
  },
  reservationExternalCardSmallPhone: {
    padding: spacing.xs
  },
  reservationExternalPhoneInput: {
    marginBottom: 0
  },
  settingsMealSlotRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.xs
  },
  settingsAboutInput: {
    marginTop: spacing.xs,
    marginBottom: 0
  },
  socialLinkEditorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm
  },
  socialLinkPlatformInput: {
    flex: 0.8,
    marginTop: 0,
    marginBottom: 0
  },
  socialLinkUrlInput: {
    flex: 1.4,
    marginTop: 0,
    marginBottom: 0
  },
  socialLinkRemoveButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white
  },
  settingsActions: {
    marginTop: spacing.md
  },
  digitalCategoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: 0
  },
  editorHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.sm
  },
  editorHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs
  },
  editorTrashIconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF1ED'
  },
  editorCloseIconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardDeep,
    borderWidth: 1,
    borderColor: colors.line
  },
  editorFooterActions: {
    marginTop: spacing.md,
    gap: spacing.sm
  },
  menuEditorNamePriceRow: {
    flexDirection: 'row',
    gap: spacing.sm
  },
  menuEditorFieldGroup: {
    marginTop: 18,
    gap: 8
  },
  menuEditorFieldGroupFirst: {
    marginTop: 0
  },
  menuEditorNameField: {
    flex: 1,
    minWidth: 0
  },
  menuEditorPriceField: {
    width: 98
  },
  menuEditorFieldLabel: {
    marginTop: 0,
    marginBottom: 0,
    fontFamily: fonts.bodyStrong,
    fontSize: 12,
    color: '#71809A'
  },
  menuEditorInput: {
    marginTop: 0,
    marginBottom: 0,
    borderColor: '#D7E0EF',
    borderRadius: 13,
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  menuEditorDescriptionInput: {
    minHeight: 62,
    textAlignVertical: 'top'
  },
  menuEditorAllergenRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: 2
  },
  menuEditorAllergenChip: {
    borderWidth: 1,
    borderColor: '#D7E0EF',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: colors.white
  },
  menuEditorAllergenChipActive: {
    borderColor: '#70AD86',
    backgroundColor: '#70AD86'
  },
  menuEditorAllergenChipText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: '#71809A'
  },
  menuEditorAllergenChipTextActive: {
    fontFamily: fonts.bodyStrong,
    color: colors.white
  },
  menuEditorWeekdayRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs
  },
  menuEditorWeekdayChip: {
    minWidth: 40,
    alignItems: 'center',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#F1F4F9'
  },
  menuEditorWeekdayChipActive: {
    backgroundColor: '#6D96DD'
  },
  menuEditorWeekdayChipText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 12,
    color: '#98A4B8'
  },
  menuEditorWeekdayChipTextActive: {
    color: colors.white
  },
  buttonIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    width: '100%'
  },
  buttonIconRowCompact: {
    gap: 4
  },
  editorCancelCenterButton: {
    marginTop: spacing.xs,
    alignSelf: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 8
  },
  editorCancelCenterText: {
    fontFamily: fonts.bodyStrong,
    color: colors.muted
  },
  digitalCategoryChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    backgroundColor: colors.white
  },
  digitalCategoryChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  digitalCategoryChipText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 12,
    color: colors.ink
  },
  digitalCategoryChipTextActive: {
    color: colors.white
  },
  removeButtonWide: {
    marginTop: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.accentWarm,
    paddingVertical: 11,
    alignItems: 'center'
  },
  removeButtonWideText: {
    fontFamily: fonts.bodyStrong,
    color: colors.white
  },
  preview: {
    width: '100%',
    height: 180,
    borderRadius: radius.md,
    marginBottom: spacing.sm
  },
  offerRow: {
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    gap: spacing.sm
  },
  offerRowOffline: {
    backgroundColor: 'rgba(0,0,0,0.01)'
  },
  offerInfo: {
    gap: 2
  },
  offerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm
  },
  offerTitle: {
    fontFamily: fonts.bodyStrong,
    color: colors.ink,
    flex: 1
  },
  offerMeta: {
    fontFamily: fonts.body,
    color: colors.muted
  },
  offerMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    flexWrap: 'wrap'
  },
  offerTypeBadge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4
  },
  offerTypeBadgeText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 11,
    color: colors.accent
  },
  offerDescription: {
    marginTop: 2,
    fontFamily: fonts.body,
    color: colors.ink
  },
  offerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flexWrap: 'wrap'
  },
  offerActionsSmallPhone: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: spacing.xs
  },
  servicesDashboardPanel: {
    gap: spacing.md
  },
  servicesDashboardTabs: {
    flexDirection: 'row',
    gap: spacing.xs,
    padding: 4,
    borderRadius: radius.md,
    backgroundColor: colors.cardDeep,
    borderWidth: 1,
    borderColor: colors.line
  },
  servicesDashboardTab: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm
  },
  servicesDashboardTabActive: {
    backgroundColor: colors.accent
  },
  servicesDashboardTabText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 14,
    color: colors.ink
  },
  servicesDashboardTabTextActive: {
    color: colors.white
  },
  cateringProfileButton: {
    marginTop: spacing.md
  },
  cateringDashboardHeading: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm
  },
  cateringDashboardHeadingCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4
  },
  cateringProfileEditIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft
  },
  cateringProfileLinkButton: {
    marginTop: spacing.md,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#BFEAF0',
    backgroundColor: '#F1FBFD'
  },
  cateringProfileLinkText: {
    flex: 1,
    minWidth: 0,
    fontFamily: fonts.bodyStrong,
    fontSize: 13,
    color: colors.accent
  },
  cateringOfferCreateButton: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs
  },
  cateringOfferEditor: {
    marginTop: spacing.md,
    padding: spacing.md,
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#BFEAF0',
    backgroundColor: '#F7FCFD'
  },
  cateringOfferEditorTitle: {
    fontFamily: fonts.bodyStrong,
    fontSize: 16,
    color: colors.ink
  },
  cateringOfferFeedback: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.accentWarm
  },
  cateringOfferImageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm
  },
  cateringOfferImageLabel: {
    flex: 1,
    fontFamily: fonts.bodyStrong,
    fontSize: 13,
    color: colors.ink
  },
  cateringOfferImageButton: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: '#8DDAE4',
    backgroundColor: colors.white
  },
  cateringOfferImageButtonDisabled: {
    opacity: 0.45
  },
  cateringOfferImageButtonText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 12,
    color: colors.accent
  },
  cateringOfferImageRow: {
    gap: spacing.sm,
    paddingVertical: 2
  },
  cateringOfferImagePreviewWrap: {
    width: 88,
    height: 70,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.cardDeep
  },
  cateringOfferImagePreview: {
    width: '100%',
    height: '100%'
  },
  cateringOfferImageRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(20, 28, 45, 0.78)'
  },
  cateringOfferEditorActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center'
  },
  cateringOfferEditorSave: {
    flex: 1
  },
  cateringOfferEditorCancel: {
    minWidth: 110,
    marginTop: 0
  },
  cateringOfferList: {
    marginTop: spacing.lg,
    gap: spacing.sm
  },
  cateringOfferRow: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    gap: spacing.sm
  },
  cateringOfferRowOffline: {
    opacity: 0.62,
    backgroundColor: '#F8FAFC'
  },
  cateringOfferRowCopy: {
    gap: 4
  },
  cateringOfferListImageRow: {
    gap: spacing.xs,
    paddingTop: spacing.xs
  },
  cateringOfferListImage: {
    width: 62,
    height: 48,
    borderRadius: radius.sm,
    backgroundColor: colors.cardDeep
  },
  cateringOfferRowTitleLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm
  },
  cateringOfferRowPrice: {
    fontFamily: fonts.bodyStrong,
    color: '#168F4A',
    fontSize: 14
  },
  cateringOfferRowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm
  },
  keyboardAccessory: {
    backgroundColor: '#F5F7FA',
    borderTopWidth: 1,
    borderTopColor: '#D5DCE5',
    minHeight: 44,
    justifyContent: 'center'
  },
  keyboardAccessoryDivider: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: '#D5DCE5'
  },
  keyboardAccessoryDoneButton: {
    alignSelf: 'flex-end',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg
  },
  keyboardAccessoryDoneText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 16,
    color: '#007AFF'
  },
  offerEditButton: {
    backgroundColor: colors.accentWarm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs
  },
  offerDeleteButton: {
    backgroundColor: '#DC2626',
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs
  },
  offerDeleteButtonDisabled: {
    opacity: 0.55
  },
  offerEditButtonText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 12,
    color: colors.white
  },
  guideSectionList: {
    gap: spacing.sm
  },
  guideSectionListCompact: {
    gap: spacing.xs
  },
  guideSectionCard: {
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.cardDeep
  },
  guideSectionCardActive: {
    backgroundColor: colors.white,
    borderColor: 'rgba(14, 165, 233, 0.22)'
  },
  guideSectionCardCompact: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg
  },
  guideSectionButton: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm
  },
  guideSectionButtonCompact: {
    flexDirection: 'column',
    alignItems: 'stretch'
  },
  guideSectionButtonTextWrap: {
    flex: 1
  },
  guideSectionTitle: {
    fontFamily: fonts.bodyStrong,
    color: colors.ink,
    marginBottom: 4
  },
  guideSectionTitleCompact: {
    fontSize: 14,
    lineHeight: 18,
    marginBottom: 2
  },
  guideSectionIntro: {
    fontFamily: fonts.body,
    color: colors.muted,
    lineHeight: 20
  },
  guideSectionIntroCompact: {
    fontSize: 13,
    lineHeight: 18
  },
  guideSectionMetaWrap: {
    alignItems: 'flex-end',
    gap: 2
  },
  guideSectionMetaWrapCompact: {
    alignItems: 'flex-start',
    marginTop: spacing.xs
  },
  guideSectionMetaText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 11,
    color: colors.accent
  },
  guideSupportCard: {
    marginBottom: spacing.md,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: 'rgba(14, 165, 233, 0.05)',
    gap: spacing.sm
  },
  guideSupportCardCompact: {
    marginBottom: spacing.sm,
    padding: spacing.sm,
    flex: 1,
    borderRadius: radius.lg
  },
  guideSupportInput: {
    minHeight: 220,
    textAlignVertical: 'top'
  },
  guideSupportInputCompact: {
    minHeight: 320,
    flexGrow: 1
  },
  guideSupportSendButton: {
    marginTop: spacing.xs
  },
  guideFooter: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    flexDirection: 'row',
    gap: spacing.sm
  },
  guideFooterCompact: {
    flexDirection: 'column',
    gap: spacing.xs,
    marginTop: spacing.sm,
    paddingTop: spacing.sm
  },
  guideFooterPrimaryButton: {
    flex: 1
  },
  guideFooterPrimaryButtonSplit: {
    flex: 1
  },
  guideFooterSecondaryButton: {
    flex: 1
  },
  guideFooterButtonCompact: {
    marginTop: 0,
    minHeight: 44,
    paddingVertical: 10,
    borderRadius: radius.lg,
    flexGrow: 0,
    flexBasis: 'auto'
  },
  guideFooterButtonTextCompact: {
    fontSize: 13
  },
  guideStepListCompact: {
    marginTop: spacing.sm,
    gap: spacing.xs
  },
  guideStepRowCompact: {
    gap: spacing.xs
  },
  guideStepBadgeCompact: {
    width: 20,
    height: 20
  },
  guideStepBadgeTextCompact: {
    fontSize: 11
  },
  guideStepTextCompact: {
    fontSize: 13,
    lineHeight: 18
  },
  specialClosurePickerCard: {
    maxWidth: 420
  },
  specialClosurePickerScroll: {
    maxHeight: 360
  },
  specialClosurePickerScrollSmallPhone: {
    flex: 1,
    minHeight: 0,
    maxHeight: '100%'
  },
  specialClosurePickerScrollContent: {
    gap: spacing.xs,
    paddingBottom: spacing.xs
  },
  specialClosurePickerScrollContentSmallPhone: {
    paddingBottom: spacing.sm
  },
  specialClosurePickerRow: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 12,
    backgroundColor: colors.white
  },
  specialClosurePickerRowActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft
  },
  specialClosurePickerRowText: {
    fontFamily: fonts.bodyStrong,
    color: colors.ink
  },
  specialClosurePickerRowTextActive: {
    color: colors.accent
  },
  reviewAdminList: {
    marginTop: spacing.md,
    gap: spacing.md
  },
  reviewAdminCard: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    padding: spacing.md,
    gap: spacing.sm
  },
  reviewAdminCardUnread: {
    borderColor: 'rgba(245, 158, 11, 0.45)',
    backgroundColor: 'rgba(245, 158, 11, 0.06)'
  },
  reviewAdminCardHighlighted: {
    borderColor: colors.accent,
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4
  },
  reviewAdminHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm
  },
  reviewAdminHeaderMain: {
    flex: 1,
    gap: 3
  },
  reviewAdminStars: {
    flexDirection: 'row',
    gap: 2
  },
  reviewAdminAuthor: {
    fontFamily: fonts.bodyStrong,
    color: colors.ink
  },
  reviewAdminDate: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted
  },
  reviewUnreadBadge: {
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    backgroundColor: colors.accentWarm
  },
  reviewUnreadBadgeText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 11,
    color: colors.white
  },
  reviewAdminText: {
    fontFamily: fonts.body,
    color: colors.ink,
    lineHeight: 21
  },
  reviewAdminImageScroll: {
    marginTop: 2
  },
  reviewAdminImageRow: {
    flexDirection: 'row',
    gap: spacing.xs
  },
  reviewAdminImage: {
    width: 82,
    height: 82,
    borderRadius: radius.md,
    backgroundColor: colors.line
  },
  reviewAdminReplyBox: {
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    borderRadius: radius.sm,
    backgroundColor: colors.cardDeep,
    padding: spacing.sm
  },
  reviewAdminReplyLabel: {
    fontFamily: fonts.bodyStrong,
    fontSize: 12,
    color: colors.accent
  },
  reviewAdminReplyText: {
    marginTop: 3,
    fontFamily: fonts.body,
    color: colors.ink,
    lineHeight: 19
  },
  reviewReplyInput: {
    minHeight: 96,
    marginTop: 0,
    marginBottom: 0
  },
  reviewAdminActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    alignItems: 'center'
  },
  reviewModerationBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: 'rgba(0, 188, 212, 0.1)'
  },
  reviewModerationBadgeRemoved: {
    backgroundColor: 'rgba(194, 65, 12, 0.1)'
  },
  reviewModerationBadgeText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 12,
    color: colors.accentCool
  },
  reviewModerationBadgeTextRemoved: {
    color: '#C2410C'
  },
  reviewModerationNote: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted
  },
  reviewReportLink: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5
  },
  reviewReportLinkText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 13,
    color: '#C2410C'
  },
  reviewReportModalWrap: {
    flex: 1,
    justifyContent: 'flex-end'
  },
  reviewReportBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.48)'
  },
  reviewReportSheet: {
    maxHeight: '88%',
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    paddingTop: 10,
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -8 },
    elevation: 18
  },
  reviewReportHandle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
    marginBottom: spacing.sm
  },
  reviewReportHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm
  },
  reviewReportHeaderText: {
    flex: 1,
    minWidth: 0
  },
  reviewReportTitle: {
    fontFamily: fonts.display,
    fontSize: 23,
    color: colors.ink
  },
  reviewReportSubtitle: {
    marginTop: 4,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted
  },
  reviewReportScroll: {
    marginTop: spacing.md
  },
  reviewReportScrollContent: {
    paddingBottom: spacing.sm
  },
  reviewReportSectionLabel: {
    marginBottom: spacing.xs,
    fontFamily: fonts.bodyStrong,
    fontSize: 14,
    color: colors.ink
  },
  reviewReportReasonList: {
    gap: 8,
    marginBottom: spacing.md
  },
  reviewReportReason: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.white
  },
  reviewReportReasonSelected: {
    borderColor: colors.accentCool,
    backgroundColor: 'rgba(0, 188, 212, 0.08)'
  },
  reviewReportReasonText: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ink
  },
  reviewReportReasonTextSelected: {
    fontFamily: fonts.bodyStrong,
    color: colors.accentCool
  },
  reviewReportNoteInput: {
    minHeight: 92,
    marginTop: 0,
    marginBottom: 0
  },
  reviewReportCounter: {
    marginTop: 4,
    textAlign: 'right',
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.muted
  },
  reviewReportFooter: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: spacing.sm,
    gap: spacing.xs
  },
  eventEditorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.lg,
    marginTop: spacing.md
  },
  eventEditorForm: {
    flex: 1,
    minWidth: 280,
    gap: spacing.sm
  },
  eventPreviewColumn: {
    maxWidth: '100%',
    gap: spacing.sm
  },
  eventFormPanel: {
    marginTop: spacing.lg,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.xl,
    padding: spacing.md,
    backgroundColor: colors.page,
    gap: spacing.sm
  },
  eventAdminHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap'
  },
  eventOccurrenceManager: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    overflow: 'hidden'
  },
  eventOccurrenceToggle: {
    minHeight: 52,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm
  },
  eventOccurrenceToggleTextWrap: {
    flex: 1
  },
  eventOccurrenceToggleTitle: {
    fontFamily: fonts.bodyStrong,
    fontSize: 14,
    color: colors.ink
  },
  eventOccurrenceToggleHint: {
    marginTop: 2,
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.muted
  },
  eventOccurrenceList: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    padding: spacing.sm,
    gap: spacing.sm
  },
  eventOccurrenceRow: {
    borderRadius: radius.sm,
    backgroundColor: colors.page,
    padding: spacing.sm,
    gap: 8
  },
  eventOccurrenceDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7
  },
  eventOccurrenceDateText: {
    flex: 1,
    fontFamily: fonts.bodyStrong,
    fontSize: 13,
    color: colors.ink
  },
  eventOccurrenceCancelledText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.accentWarm
  },
  eventCancellationReasonInput: {
    marginBottom: 0,
    minHeight: 42
  },
  eventOccurrenceCancelButton: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: colors.accentWarm,
    paddingHorizontal: spacing.md,
    paddingVertical: 9
  },
  eventOccurrenceCancelText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 12,
    color: colors.white
  },
  eventOccurrenceRestoreButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.accentCool,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    backgroundColor: colors.white
  },
  eventOccurrenceRestoreText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 12,
    color: colors.accentCool
  },
  eventRefreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
    backgroundColor: colors.white
  },
  eventRefreshButtonText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 12,
    color: colors.accent
  },
  eventTagEditorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  eventTagEditorChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
    backgroundColor: colors.white
  },
  eventTagEditorChipActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink
  },
  eventTagEditorChipPrimary: {
    borderColor: colors.accentSoft,
    borderWidth: 2
  },
  eventTagEditorText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 12,
    color: colors.ink
  },
  eventTagEditorTextActive: {
    color: colors.white
  },
  eventDateInputRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm
  },
  eventDateInput: {
    flexGrow: 1,
    flexBasis: 190
  },
  eventDatePickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm
  },
  eventDatePickerGroup: {
    flex: 1,
    minWidth: 230,
    gap: 6
  },
  eventDatePickerLabel: {
    fontFamily: fonts.bodyStrong,
    fontSize: 12,
    color: colors.muted,
    textTransform: 'uppercase'
  },
  eventDatePickerLabelRow: {
    minHeight: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm
  },
  eventAdditionalDateAddButton: {
    minHeight: 26,
    borderRadius: 999,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(8, 184, 200, 0.10)'
  },
  eventAdditionalDateAddText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 11,
    color: colors.accent
  },
  eventDatePickerRow: {
    flexDirection: 'row',
    gap: spacing.sm
  },
  eventDatePickerButton: {
    flex: 1,
    minHeight: 46,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
    backgroundColor: colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7
  },
  eventDatePickerButtonText: {
    flex: 1,
    fontFamily: fonts.bodyStrong,
    fontSize: 13,
    color: colors.ink
  },
  eventAdditionalDatesBox: {
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: spacing.sm,
    backgroundColor: colors.cardDeep
  },
  eventAddOccurrenceButton: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.white
  },
  eventAddOccurrenceText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 14,
    color: colors.accent
  },
  eventAdditionalDatesTitle: {
    fontFamily: fonts.bodyStrong,
    fontSize: 14,
    color: colors.ink
  },
  eventAdditionalOccurrenceCard: {
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: spacing.sm
  },
  eventAdditionalOccurrenceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm
  },
  eventAdditionalDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm
  },
  eventAdditionalDateButton: {
    flex: 1,
    minHeight: 46,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7
  },
  eventAdditionalDateRemoveButton: {
    width: 46,
    height: 46,
    borderWidth: 1,
    borderColor: 'rgba(249, 115, 22, 0.25)',
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white
  },
  eventRecurrenceBox: {
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: spacing.sm,
    backgroundColor: colors.white
  },
  eventSocialEditorBox: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    overflow: 'hidden'
  },
  eventSocialEditorToggle: {
    minHeight: 50,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm
  },
  eventSocialEditorToggleTextWrap: {
    flex: 1
  },
  eventSocialEditorTitle: {
    fontFamily: fonts.bodyStrong,
    fontSize: 14,
    color: colors.ink
  },
  eventSocialEditorHint: {
    marginTop: 2,
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.muted
  },
  eventSocialEditorContent: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    padding: spacing.sm,
    gap: spacing.sm
  },
  eventRecurrenceModeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm
  },
  eventRecurrenceModeChip: {
    minHeight: 38,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    backgroundColor: colors.page,
    justifyContent: 'center'
  },
  eventRecurrenceModeChipActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink
  },
  eventRecurrenceModeText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 13,
    color: colors.ink
  },
  eventRecurrenceModeTextActive: {
    color: colors.white
  },
  eventRecurrenceDetails: {
    gap: spacing.sm
  },
  eventWeekdayRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  eventWeekdayChip: {
    width: 42,
    height: 42,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.page,
    alignItems: 'center',
    justifyContent: 'center'
  },
  eventWeekdayChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  eventWeekdayText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 13,
    color: colors.ink
  },
  eventWeekdayTextActive: {
    color: colors.white
  },
  eventEditorActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    alignItems: 'stretch'
  },
  eventFormFeedback: {
    width: '100%',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm
  },
  eventFormFeedbackSuccess: {
    borderColor: 'rgba(34, 197, 94, 0.35)',
    backgroundColor: 'rgba(34, 197, 94, 0.10)'
  },
  eventFormFeedbackError: {
    borderColor: 'rgba(249, 115, 22, 0.42)',
    backgroundColor: 'rgba(249, 115, 22, 0.10)'
  },
  eventFormFeedbackTextWrap: {
    flex: 1,
    gap: 3
  },
  eventFormFeedbackText: {
    flex: 1,
    fontFamily: fonts.bodyStrong,
    fontSize: 13,
    lineHeight: 19
  },
  eventFormFeedbackSuccessText: {
    color: colors.accentCool
  },
  eventFormFeedbackErrorText: {
    color: colors.accentWarm
  },
  eventEditorActionButton: {
    flexGrow: 1,
    flexBasis: 150,
    minHeight: 46,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    marginTop: 0
  },
  eventImageButton: {
    minHeight: 46,
    marginTop: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm
  },
  eventCreateButton: {
    minHeight: 48,
    marginTop: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm
  },
  eventAdminList: {
    gap: spacing.md,
    marginTop: spacing.lg
  },
  eventAdminCard: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: spacing.sm,
    backgroundColor: colors.white,
    gap: spacing.sm
  },
  eventAdminActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    alignItems: 'center'
  },
  eventVisibilityPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6
  },
  eventVisibilityPillVisible: {
    backgroundColor: 'rgba(34,197,94,0.12)'
  },
  eventVisibilityPillHidden: {
    backgroundColor: 'rgba(249,115,22,0.12)'
  },
  eventVisibilityText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 12
  },
  eventVisibilityTextVisible: {
    color: colors.accentCool
  },
  eventVisibilityTextHidden: {
    color: colors.accentWarm
  },
  dashboardFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: 76,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-around',
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderTopWidth: 1,
    borderTopColor: colors.line,
    zIndex: 20,
    ...shadow
  },
  dashboardFooterButton: {
    flex: 1,
    minWidth: 0,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 4,
    borderRadius: radius.md
  },
  dashboardFooterButtonPressed: {
    backgroundColor: colors.page,
    opacity: 0.86
  },
  dashboardFooterButtonText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 11,
    color: colors.ink,
    textAlign: 'center'
  },
  dashboardFooterLogoutText: {
    color: colors.accentWarm
  },
  websiteSyncScreen: {
    flex: 1,
    backgroundColor: colors.page
  },
  websiteSyncHeader: {
    minHeight: 72,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    backgroundColor: colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm
  },
  websiteSyncHeaderCopy: {
    flex: 1,
    minWidth: 0
  },
  websiteSyncHeaderTitle: {
    fontFamily: fonts.displaySoft,
    fontSize: 19,
    color: colors.ink
  },
  websiteSyncHeaderText: {
    marginTop: 2,
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted
  },
  websiteSyncHeaderIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: '#E8F7FA',
    alignItems: 'center',
    justifyContent: 'center'
  },
  websiteSyncScroll: {
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
    padding: spacing.lg,
    paddingBottom: 48,
    gap: spacing.md
  },
  websiteSyncIntroCard: {
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow
  },
  websiteSyncIntroIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8F7FA'
  },
  websiteSyncIntroTitle: {
    fontFamily: fonts.displaySoft,
    fontSize: 22,
    color: colors.ink
  },
  websiteSyncIntroText: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22,
    color: colors.muted
  },
  websiteSyncUrlInput: {
    marginBottom: 0
  },
  websiteSyncProgressCard: {
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: '#BEE7EF',
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow
  },
  websiteSyncProgressHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm
  },
  websiteSyncProgressTitle: {
    flex: 1,
    fontFamily: fonts.bodyStrong,
    fontSize: 17,
    color: colors.ink
  },
  websiteSyncProgressTrack: {
    height: 10,
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: '#E7F3F6'
  },
  websiteSyncProgressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: colors.accent
  },
  websiteSyncProgressText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.muted
  },
  websiteSyncReadyCard: {
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: '#EDF8F1',
    borderWidth: 1,
    borderColor: '#CBEAD5',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm
  },
  websiteSyncReadyCopy: {
    flex: 1,
    minWidth: 0
  },
  websiteSyncReadyTitle: {
    fontFamily: fonts.bodyStrong,
    fontSize: 16,
    color: colors.ink
  },
  websiteSyncReadyText: {
    marginTop: 2,
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted
  },
  websiteSyncReadyMeta: {
    marginTop: 5,
    fontFamily: fonts.bodyStrong,
    fontSize: 11,
    color: '#248B57'
  },
  websiteSyncRepeatActions: {
    flexDirection: 'row',
    gap: spacing.sm
  },
  websiteSyncRepeatButton: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: spacing.sm,
    justifyContent: 'center',
    alignItems: 'center'
  },
  websiteSyncSectionCard: {
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    gap: spacing.md
  },
  websiteSyncSectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm
  },
  websiteSyncSectionIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: '#E8F7FA',
    alignItems: 'center',
    justifyContent: 'center'
  },
  websiteSyncSectionCopy: {
    flex: 1,
    minWidth: 0
  },
  websiteSyncSectionTitle: {
    fontFamily: fonts.bodyStrong,
    fontSize: 16,
    color: colors.ink
  },
  websiteSyncSectionText: {
    marginTop: 2,
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 17,
    color: colors.muted
  },
  websiteSyncSourceText: {
    marginTop: 2,
    fontFamily: fonts.body,
    fontSize: 11,
    color: '#6B7B8F'
  },
  websiteSyncSectionStatus: {
    fontFamily: fonts.bodyStrong,
    fontSize: 11,
    color: '#248B57'
  },
  websiteSyncSectionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs
  },
  websiteSyncPrimaryAction: {
    flex: 1,
    minWidth: 150
  },
  websiteSyncMenuAction: {
    flex: 1,
    minWidth: 112,
    minHeight: 42,
    justifyContent: 'center',
    alignItems: 'center'
  },
  websiteSyncAssignActions: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs
  },
  websiteSyncAssignButton: {
    minHeight: 38,
    borderRadius: radius.md,
    backgroundColor: '#EEF5FF',
    paddingHorizontal: spacing.sm,
    justifyContent: 'center'
  },
  websiteSyncAssignText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 12,
    color: '#355E9D'
  },
  websiteSyncSelectionText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted,
    marginRight: 'auto',
    paddingHorizontal: spacing.xs
  },
  websiteSyncPreviewAction: {
    minHeight: 42,
    width: '100%',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#BCE9F0',
    backgroundColor: '#F0FBFD',
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs
  },
  websiteSyncPreviewText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 13,
    color: colors.accent
  },
  websiteSyncSkipAction: {
    minHeight: 42,
    paddingHorizontal: spacing.sm,
    justifyContent: 'center'
  },
  websiteSyncSkipText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 12,
    color: colors.muted
  },
  websiteSyncWarningCard: {
    borderRadius: radius.md,
    backgroundColor: '#FFF7E8',
    borderWidth: 1,
    borderColor: '#F5D89A',
    padding: spacing.md,
    flexDirection: 'row',
    gap: spacing.sm
  },
  websiteSyncNoMenuCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#F8FAFC',
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm
  },
  websiteSyncNoMenuText: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
    color: colors.muted
  },
  websiteSyncWarningText: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 18,
    color: colors.ink
  },
  websiteSyncPreviewScroll: {
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
    padding: spacing.lg,
    paddingBottom: 28,
    gap: spacing.sm
  },
  websiteSyncPreviewHint: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
    marginBottom: spacing.xs
  },
  websiteSyncDishCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white
  },
  websiteSyncDishCardSelected: {
    borderColor: '#7CD2DF',
    backgroundColor: '#F5FCFD'
  },
  websiteSyncDishCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#EEF1F5',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1
  },
  websiteSyncDishCheckSelected: {
    backgroundColor: colors.accent
  },
  websiteSyncDishCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4
  },
  websiteSyncDishTopLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm
  },
  websiteSyncDishName: {
    flex: 1,
    fontFamily: fonts.bodyStrong,
    fontSize: 15,
    lineHeight: 20,
    color: colors.ink
  },
  websiteSyncDishPrice: {
    fontFamily: fonts.bodyStrong,
    fontSize: 14,
    color: '#168F4A'
  },
  websiteSyncDishPriceInput: {
    minWidth: 82,
    height: 34,
    borderWidth: 1,
    borderColor: '#F1B65F',
    borderRadius: radius.sm,
    paddingHorizontal: 9,
    fontFamily: fonts.bodyStrong,
    fontSize: 13,
    color: colors.ink,
    textAlign: 'right',
    backgroundColor: '#FFF9EE'
  },
  websiteSyncDishDescription: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted
  },
  websiteSyncDishMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginTop: 2
  },
  websiteSyncDishCategory: {
    fontFamily: fonts.bodyStrong,
    fontSize: 11,
    color: colors.accent,
    backgroundColor: '#E8F7FA',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3
  },
  websiteSyncDishAllergens: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.muted,
    flexShrink: 1
  },
  websiteSyncDishSources: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: '#6B7B8F'
  },
  websiteSyncPreviewFooter: {
    padding: spacing.md,
    paddingBottom: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.white
  },
  statusPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: 999
  },
  statusOn: {
    backgroundColor: colors.accentCool
  },
  statusOff: {
    backgroundColor: colors.accentWarm
  },
  statusPillText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 12,
    color: colors.white
  },
  orderRow: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    gap: spacing.sm
  },
  orderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap'
  },
  orderActionsSmallPhone: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: spacing.xs
  },
  editButton: {
    backgroundColor: colors.accentWarm,
    padding: 10,
    borderRadius: 999
  },
  editButtonCancel: {
    backgroundColor: colors.accentWarm,
    padding: 10,
    borderRadius: 999,
    opacity: 0.72
  }
});

export default RestaurantScreen;
