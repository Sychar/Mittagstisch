import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TextInput,
  Pressable,
  FlatList,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Linking,
  Animated,
  Easing,
  Modal,
  Keyboard,
  Share
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import OfferCard, { getRestaurantOpenState, isRestaurantOpenOnWeekday } from '../components/OfferCard';
import EventCard from '../components/EventCard';
import RestaurantMap from '../components/RestaurantMap';
import { colors, fonts, radius, shadow, spacing } from '../theme/theme';
import { useOffers, formatPrice } from '../store/OffersContext';
import { cateringEnabled, eventsEnabled } from '../config/features';
import { eventTagOptions, eventTagLabelByKey } from '../events/eventConfig';

const appIcon = require('../../assets/icon33.jpeg');
const IMPRESSUM_URL = 'https://bundle.jetzt/impressum';
const DATENSCHUTZ_URL = 'https://home.nahundfein.com/datenschutz/index.html';
const AGB_URL = 'https://home.nahundfein.com/agb/index.html';
const INSTAGRAM_URL = 'https://www.instagram.com/nah_und_fein/';
const mealSlotOptions = [
  { key: 'breakfast', label: 'Frühstück', icon: 'cafe-outline' },
  { key: 'lunch', label: 'Mittag', icon: 'sunny-outline' },
  { key: 'dinner', label: 'Allgemeine Karte', icon: 'moon-outline' }
];
const restaurantRadiusOptions = [5, 10, 25, 50];
const eventRadiusOptions = [5, 10, 25, 50];
const cuisineFilterOptions = [
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
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const timeStepMinutes = 15;
const mealSlotDefaultMinutes = {
  breakfast: 9 * 60,
  lunch: 12 * 60,
  dinner: 18 * 60
};
const RESTAURANT_ABOUT_PREVIEW_LIMIT = 240;
const normalizeComparableText = (value) =>
  String(value || '')
    .trim()
    .toLocaleLowerCase('de-DE')
    .replace(/\s+/g, ' ');
const hasDistinctProviderDescription = (providerText, eventText) => {
  const normalizedProviderText = normalizeComparableText(providerText);
  return Boolean(normalizedProviderText) && normalizedProviderText !== normalizeComparableText(eventText);
};
const digitalMenuCategoryLabelByKey = {
  Vegan: 'Vegan',
  Vegetarisch: 'Vegetarisch',
  Normal: 'Fleischgerichte',
  Getränke: 'Getränke'
};
const digitalMenuDietFilterOptions = [
  { key: 'all', label: 'Alle' },
  { key: 'vegan', label: 'Vegan' },
  { key: 'vegetarian', label: 'Vegetarisch' },
  { key: 'drinks', label: 'Getränke' }
];
const openingHourDays = [
  { key: 'mon', label: 'Montag' },
  { key: 'tue', label: 'Dienstag' },
  { key: 'wed', label: 'Mittwoch' },
  { key: 'thu', label: 'Donnerstag' },
  { key: 'fri', label: 'Freitag' },
  { key: 'sat', label: 'Samstag' },
  { key: 'sun', label: 'Sonntag' }
];
const lunchWeekdayShortLabelByKey = {
  mon: 'Mo',
  tue: 'Di',
  wed: 'Mi',
  thu: 'Do',
  fri: 'Fr',
  sat: 'Sa',
  sun: 'So'
};
const specialClosureDatePattern = /^\d{4}-\d{2}-\d{2}$/;

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

const normalizeDigitalMenuCategory = (...values) => {
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

const toDigitalMenuCategoryLabel = (category) =>
  digitalMenuCategoryLabelByKey[normalizeDigitalMenuCategory(category)] || 'Fleischgerichte';

const normalizeDigitalMenuSection = (value, category) => {
  const normalizedCategory = normalizeDigitalMenuCategory(category);
  const text = String(value || '')
    .trim()
    .replace(/\s+/g, ' ');
  if (text) {
    if (normalizedCategory === 'Getränke' && !isDigitalMenuDrinkText(text)) {
      return toDigitalMenuCategoryLabel(normalizedCategory);
    }
    return text.slice(0, 120);
  }
  return toDigitalMenuCategoryLabel(normalizedCategory);
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

const normalizeItemAllergenList = (value) => {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const normalized = [];
  value.forEach((entry) => {
    const text = String(entry || '').trim();
    if (!text) return;
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    normalized.push(text);
  });
  return normalized.slice(0, 20);
};

const normalizeLunchMenuWeekdays = (value) => {
  if (!Array.isArray(value)) return [];
  const order = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  return order.filter((entry) => value.includes(entry));
};

const formatLunchMenuAvailability = (weekdays) => {
  const normalized = normalizeLunchMenuWeekdays(weekdays);
  if (!normalized.length) return '';
  return normalized.map((entry) => lunchWeekdayShortLabelByKey[entry] || entry).join(', ');
};

const formatLunchMenuSchedule = (item) => {
  if (!item) return '';
  const scheduleMode = item.scheduleMode || item.lunchMenuScheduleMode;
  const validFrom = item.validFrom || item.lunchMenuValidFrom;
  const validUntil = item.validUntil || item.lunchMenuValidUntil;
  if (scheduleMode === 'dateRange' && validFrom) {
    const formatDate = (value) => {
      const date = new Date(`${value}T12:00:00`);
      return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('de-DE');
    };
    return `${formatDate(validFrom)}–${validUntil ? formatDate(validUntil) : 'ohne Ende'}`;
  }
  if (scheduleMode === 'openingHours') return 'An den regulären Öffnungstagen';
  return formatLunchMenuAvailability(item.availableWeekdays || item.lunchMenuAvailableWeekdays);
};

const getTodayLunchWeekdayKey = (date = new Date()) => {
  const weekdayByIndex = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  return weekdayByIndex[date.getDay()] || '';
};

const isTodayOnlyLunchMenuItem = (item, todayWeekdayKey = getTodayLunchWeekdayKey()) => {
  if (!item || item.itemSourceType !== 'lunchMenu' || item.isRestaurantOnly || item.active === false) {
    return false;
  }
  const weekdays = normalizeLunchMenuWeekdays(item.lunchMenuAvailableWeekdays);
  return weekdays.length === 1 && weekdays[0] === todayWeekdayKey;
};

const toTimeLabel = (totalMinutes) => {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const toDateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatReviewDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
};

const normalizePhoneLink = (phone) => {
  const text = String(phone || '').trim();
  if (!text) return '';
  const sanitized = text.replace(/[^\d+]/g, '');
  return sanitized ? `tel:${sanitized}` : `tel:${text}`;
};

const normalizeOpeningTimeText = (value) => {
  const text = String(value || '').trim();
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(text) ? text : null;
};

const getOpeningHoursRows = (value) => {
  if (!value || typeof value !== 'object') return [];
  return openingHourDays
    .map((day) => {
      const record = value?.[day.key];
      if (!record || typeof record !== 'object' || !record.enabled) {
        return null;
      }

      const openTime = normalizeOpeningTimeText(record.openTime);
      const closeTime = normalizeOpeningTimeText(record.closeTime);
      const periods = (Array.isArray(record.periods) && record.periods.length ? record.periods : [{ openTime, closeTime }])
        .map((period, index) => {
          const periodOpenTime = normalizeOpeningTimeText(period?.openTime);
          const periodCloseTime = normalizeOpeningTimeText(period?.closeTime);
          if (!periodOpenTime || !periodCloseTime) return null;
          if (index === 0 && record.openEnded) return `${periodOpenTime} - bis Ende`;
          const crossesMidnight = periodCloseTime <= periodOpenTime;
          return `${periodOpenTime} - ${periodCloseTime}${crossesMidnight ? ' (nächster Tag)' : ''}`;
        })
        .filter(Boolean);
      return {
        key: day.key,
        label: day.label,
        range: periods.length ? periods.join(' · ') : openTime && closeTime ? `${openTime} - ${closeTime}` : 'Uhrzeit folgt'
      };
    })
    .filter(Boolean);
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

const formatSpecialClosureLabel = (value) => {
  const text = String(value || '').trim();
  if (!specialClosureDatePattern.test(text)) return text;
  const parsed = new Date(`${text}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return text;
  return parsed.toLocaleDateString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
};

const normalizeReservationMode = (value, legacyEnabled = false) => {
  const text = String(value || '').trim().toLowerCase();
  if (text === 'app' || text === 'external' || text === 'disabled') {
    return text;
  }
  return legacyEnabled ? 'app' : 'disabled';
};

const MAP_DEFAULT_REGION = {
  latitude: 47.7811,
  longitude: 9.6125,
  latitudeDelta: 0.15,
  longitudeDelta: 0.15
};

const computeMapRegion = (points) => {
  if (!points.length) {
    return MAP_DEFAULT_REGION;
  }

  if (points.length === 1) {
    return {
      latitude: points[0].latitude,
      longitude: points[0].longitude,
      latitudeDelta: 0.03,
      longitudeDelta: 0.03
    };
  }

  const latitudes = points.map((point) => point.latitude);
  const longitudes = points.map((point) => point.longitude);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLng = Math.min(...longitudes);
  const maxLng = Math.max(...longitudes);
  const latitudeDelta = Math.max(0.03, (maxLat - minLat) * 1.45);
  const longitudeDelta = Math.max(0.03, (maxLng - minLng) * 1.45);

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta,
    longitudeDelta
  };
};

const FilterChip = ({ label, active, onPress, tone }) => {
  const isGreen = tone === 'green';
  const isGold = tone === 'gold';
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        active && styles.chipActive,
        isGold && active && styles.chipGoldActive,
        isGreen && active && styles.chipGreenActive,
        pressed && { opacity: 0.8 }
      ]}
    >
      <Text style={[styles.chipText, isGreen && active && styles.chipTextLight]}>{label}</Text>
    </Pressable>
  );
};

const PublicMenuCategoryBadge = ({ category }) => {
  const normalized = normalizeDigitalMenuCategory(category);
  if (normalized === 'Normal') return null;
  return (
    <View
      style={[
        styles.publicMenuDietBadge,
        normalized === 'Vegan'
          ? styles.publicMenuDietBadgeVegan
          : normalized === 'Getränke'
          ? styles.publicMenuDietBadgeDrinks
          : styles.publicMenuDietBadgeVegetarian
      ]}
    >
      <Text style={styles.publicMenuDietBadgeText}>{normalized}</Text>
    </View>
  );
};

const createRestaurantAboutPreview = (value, limit = RESTAURANT_ABOUT_PREVIEW_LIMIT) => {
  const text = String(value || '').trim();
  if (text.length <= limit) {
    return { text, truncated: false };
  }

  const normalizedText = text.replace(/\s+/g, ' ');
  if (normalizedText.length <= limit) {
    return { text: normalizedText, truncated: false };
  }

  const hardCut = normalizedText.slice(0, limit + 1);
  const lastSpace = hardCut.lastIndexOf(' ');
  const cutIndex = lastSpace > Math.floor(limit * 0.65) ? lastSpace : limit;
  const previewText = normalizedText
    .slice(0, cutIndex)
    .trim()
    .replace(/[.,;:!?-]+$/, '')
    .trim();

  return {
    text: `${previewText}...`,
    truncated: true
  };
};

const formatEventDateTime = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Termin folgt';
  return new Intl.DateTimeFormat('de-DE', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
};

const eventWeekdayFullLabelByKey = {
  mon: 'Montag',
  tue: 'Dienstag',
  wed: 'Mittwoch',
  thu: 'Donnerstag',
  fri: 'Freitag',
  sat: 'Samstag',
  sun: 'Sonntag'
};

const formatEventRecurrenceDetail = (event) => {
  if (event?.recurrenceType !== 'weekly') return '';
  const weekdays = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].filter((day) =>
    event?.recurrenceWeekdays?.includes(day)
  );
  const recurrenceText =
    weekdays.length === 1
      ? `Wöchentlich · jeden ${eventWeekdayFullLabelByKey[weekdays[0]]}`
      : weekdays.length
      ? `Wöchentlich · ${weekdays.map((day) => lunchWeekdayShortLabelByKey[day]).join(', ')}`
      : 'Wöchentlich';
  if (!event?.recurrenceEndAt) return recurrenceText;
  const endDate = new Date(event.recurrenceEndAt);
  return Number.isNaN(endDate.getTime())
    ? recurrenceText
    : `${recurrenceText} · bis ${endDate.toLocaleDateString('de-DE')}`;
};

const eventShareUrl = (event) => {
  const id = encodeURIComponent(String(event?.id || '').trim());
  const occurrence = event?.occurrenceStartAt || event?.startAt || '';
  const params = new URLSearchParams();
  if (occurrence) params.set('occurrenceStartAt', occurrence);
  return `https://app.nahundfein.com/events/${id}${params.toString() ? `?${params.toString()}` : ''}`;
};

const offerShareUrl = (offer) => {
  const id = encodeURIComponent(String(offer?.offerId || offer?.id || '').trim());
  // Existing iOS installs have /events/* cached as a Universal Link. Reuse that
  // established path until Apple's association cache learns the new /offers/* path.
  return id ? `https://app.nahundfein.com/events/offer/${id}` : '';
};

const eventSocialIcon = (platform) => {
  const value = String(platform || '').toLowerCase();
  if (value.includes('instagram')) return 'logo-instagram';
  if (value.includes('facebook')) return 'logo-facebook';
  if (value.includes('tiktok')) return 'logo-tiktok';
  if (value.includes('youtube')) return 'logo-youtube';
  return 'globe-outline';
};

const eventDateFilterToDate = (value) => {
  const text = String(value || '').trim();
  if (!specialClosureDatePattern.test(text)) return new Date();
  const date = new Date(`${text}T12:00:00`);
  return Number.isNaN(date.getTime()) ? new Date() : date;
};

const formatEventDateFilterLabel = (value) => {
  const text = String(value || '').trim();
  if (!specialClosureDatePattern.test(text)) return 'Alle kommenden Events';
  return eventDateFilterToDate(text).toLocaleDateString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
};

const UserScreen = ({
  onOpenRestaurant,
  eventNotification,
  onEventNotificationHandled,
  previewEmbedded = false,
  initialFooterTab = 'food',
  lockedEventTags = [],
  initialSelection = null,
  savedItemKeys = new Set(),
  onToggleSavedItem
}) => {
  const {
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
    placeOrder,
    orderStatus,
    orderError,
    getPublicRestaurantDigitalMenu,
    getPublicRestaurantLunchMenu,
    trackPublicRestaurantMenuView,
    trackPublicRestaurantContentView,
    getPublicRestaurantReviews,
    createRestaurantReview,
    placeTableReservation,
    reservationStatus,
    reservationError
  } = useOffers();
  const insets = useSafeAreaInsets();
  const canUseNativeDriver = Platform.OS !== 'web';
  const [query, setQuery] = useState('');
  const [activePostal, setActivePostal] = useState('');
  const [restaurantRadiusKm, setRestaurantRadiusKm] = useState(10);
  const [activeMealSlot, setActiveMealSlot] = useState('lunch');
  const [lunchNearbyFilter, setLunchNearbyFilter] = useState('all');
  const [offersPageOpen, setOffersPageOpen] = useState(false);
  const [offersDietFilter, setOffersDietFilter] = useState('all');
  const [selectedCateringProvider, setSelectedCateringProvider] = useState(null);
  const [preorderOnly, setPreorderOnly] = useState(false);
  const [sortMode, setSortMode] = useState('none');
  const [selectedCuisineTypes, setSelectedCuisineTypes] = useState([]);
  const [openingStatusFilter, setOpeningStatusFilter] = useState('all');
  const [openingDayFilter, setOpeningDayFilter] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState(null);
  const [selectedMenuItem, setSelectedMenuItem] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [eventFollowConfirmation, setEventFollowConfirmation] = useState(null);
  const [eventFollowBusy, setEventFollowBusy] = useState(false);
  const [eventFollowMessage, setEventFollowMessage] = useState('');
  const [eventNotificationPermissionDenied, setEventNotificationPermissionDenied] = useState(false);
  const [eventOrganizerExpanded, setEventOrganizerExpanded] = useState(false);
  const [eventLocationQuery, setEventLocationQuery] = useState('');
  const [activeEventLocationQuery, setActiveEventLocationQuery] = useState('');
  const [eventRadiusKm, setEventRadiusKm] = useState(10);
  const [eventDateFilter, setEventDateFilter] = useState('');
  const [eventDatePickerState, setEventDatePickerState] = useState({
    visible: false,
    value: new Date()
  });
  const [eventFiltersOpen, setEventFiltersOpen] = useState(false);
  const lockedEventTagKey = Array.isArray(lockedEventTags) ? lockedEventTags.join('|') : '';
  const [eventTagFilters, setEventTagFilters] = useState(() =>
    Array.isArray(lockedEventTags) ? lockedEventTags : []
  );
  const [eventImagePreviewUrl, setEventImagePreviewUrl] = useState('');
  const [orderName, setOrderName] = useState('');
  const [orderEmail, setOrderEmail] = useState('');
  const [orderQty, setOrderQty] = useState('1');
  const [orderTime, setOrderTime] = useState('');
  const [orderType, setOrderType] = useState('pickup');
  const [orderLocalError, setOrderLocalError] = useState('');
  const [restaurantReviews, setRestaurantReviews] = useState([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsError, setReviewsError] = useState('');
  const [reviewComposerOpen, setReviewComposerOpen] = useState(false);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [reviewAuthorName, setReviewAuthorName] = useState('');
  const [reviewImages, setReviewImages] = useState([]);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const [reviewStatus, setReviewStatus] = useState('');
  const [restaurantInfoOpen, setRestaurantInfoOpen] = useState(false);
  const [restaurantAboutExpanded, setRestaurantAboutExpanded] = useState(false);
  const [lunchMenuLoading, setLunchMenuLoading] = useState(false);
  const [lunchMenuError, setLunchMenuError] = useState('');
  const [lunchMenuItems, setLunchMenuItems] = useState([]);
  const [lunchMenuAllergens, setLunchMenuAllergens] = useState([]);
  const [lunchMenuUpdatedAt, setLunchMenuUpdatedAt] = useState(null);
  const [lunchMenuVisible, setLunchMenuVisible] = useState(false);
  const [digitalMenuLoading, setDigitalMenuLoading] = useState(false);
  const [digitalMenuError, setDigitalMenuError] = useState('');
  const [digitalMenuItems, setDigitalMenuItems] = useState([]);
  const [digitalMenuAllergens, setDigitalMenuAllergens] = useState([]);
  const [digitalMenuUpdatedAt, setDigitalMenuUpdatedAt] = useState(null);
  const [digitalMenuVisible, setDigitalMenuVisible] = useState(false);
  const [regularMenuLinksVisible, setRegularMenuLinksVisible] = useState(false);
  const [digitalMenuDietFilter, setDigitalMenuDietFilter] = useState('all');
  const [reservationName, setReservationName] = useState('');
  const [reservationEmail, setReservationEmail] = useState('');
  const [reservationPhone, setReservationPhone] = useState('');
  const [reservationPartySize, setReservationPartySize] = useState('2');
  const [reservationDate, setReservationDate] = useState('');
  const [reservationTime, setReservationTime] = useState('');
  const [reservationNote, setReservationNote] = useState('');
  const [reservationLocalError, setReservationLocalError] = useState('');
  const [preorderPanelOpen, setPreorderPanelOpen] = useState(false);
  const [reservationPanelOpen, setReservationPanelOpen] = useState(false);
  const [reservationInfoPanelOpen, setReservationInfoPanelOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isOfferHeaderCompact, setIsOfferHeaderCompact] = useState(false);
  const [activeFooterTab, setActiveFooterTab] = useState(initialFooterTab || 'food');
  const [mapFocusRestaurantKey, setMapFocusRestaurantKey] = useState('');
  const menuAnim = useRef(new Animated.Value(0)).current;
  const modalAnim = useRef(new Animated.Value(0)).current;
  const compactHeaderAnim = useRef(new Animated.Value(0)).current;
  const offerCompactRef = useRef(false);
  const orderTimeScrollRef = useRef(null);
  const eventLocationInitializedRef = useRef(false);
  const eventFollowMessageTimerRef = useRef(null);

  useEffect(() => {
    setActiveFooterTab(initialFooterTab || 'food');
  }, [initialFooterTab]);

  useEffect(() => {
    if (!lockedEventTagKey) return;
    setEventTagFilters(lockedEventTagKey.split('|').filter(Boolean));
    setEventFiltersOpen(false);
  }, [lockedEventTagKey]);

  useEffect(() => {
    setEventOrganizerExpanded(false);
  }, [selectedEvent?.id]);

  useEffect(
    () => () => {
      if (eventFollowMessageTimerRef.current) clearTimeout(eventFollowMessageTimerRef.current);
    },
    []
  );
  const reviewsRequestRef = useRef(0);

  useEffect(() => {
    Animated.timing(menuAnim, {
      toValue: menuOpen ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: canUseNativeDriver
    }).start();
  }, [menuOpen, menuAnim, canUseNativeDriver]);

  useEffect(() => {
    if (!selectedOffer) return;
    modalAnim.setValue(0);
    setIsOfferHeaderCompact(false);
    offerCompactRef.current = false;
    compactHeaderAnim.setValue(0);
    Animated.timing(modalAnim, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: canUseNativeDriver
    }).start();
  }, [selectedOffer, modalAnim]);

  useEffect(() => {
    Animated.timing(compactHeaderAnim, {
      toValue: isOfferHeaderCompact ? 1 : 0,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: canUseNativeDriver
    }).start();
  }, [isOfferHeaderCompact, compactHeaderAnim, canUseNativeDriver]);

  const searchQueryValid = activePostal.trim().length >= 2;
  const availableMealSlotOptions = mealSlotOptions;
  const isFoodTab = activeFooterTab === 'food';
  const isCateringTab = activeFooterTab === 'catering';
  const selectedMealLabel =
    availableMealSlotOptions.find((option) => option.key === activeMealSlot)?.label || 'Mittagstisch';
  const filtered = useMemo(() => {
    if (!activePostal) return [];
    if (!searchQueryValid) return [];

    let list = offers.filter((offer) => offer.mealSlot === activeMealSlot);

    if (selectedCuisineTypes.length) {
      list = list.filter((offer) => {
        const cuisineTypes = Array.isArray(offer?.restaurantCuisineTypes)
          ? offer.restaurantCuisineTypes
          : [];
        return cuisineTypes.some((entry) => selectedCuisineTypes.includes(entry));
      });
    }

    list = list.filter((offer) => offer.active !== false);

    if (openingStatusFilter !== 'all') {
      list = list.filter((offer) => {
        const openingState = getRestaurantOpenState(
          offer?.restaurantOpeningHours,
          offer?.restaurantSpecialClosures
        );
        if (!openingState) return false;
        return openingStatusFilter === 'open' ? openingState.isOpen : !openingState.isOpen;
      });
    }

    if (openingDayFilter) {
      list = list.filter((offer) =>
        isRestaurantOpenOnWeekday(offer?.restaurantOpeningHours, openingDayFilter)
      );
    }

    const grouped = new Map();
    list.forEach((item, index) => {
      const key =
        item?.restaurantId || `${item?.restaurant || 'restaurant'}::${item?.address || 'address'}`;
      if (!grouped.has(key)) {
        grouped.set(key, {
          firstIndex: index,
          distanceKm:
            typeof item?.distanceKm === 'number' ? item.distanceKm : Number.POSITIVE_INFINITY,
          offers: [],
          infoCard: null
        });
      }
      const bucket = grouped.get(key);
      if (item?.isRestaurantOnly) {
        if (!bucket.infoCard) {
          bucket.infoCard = item;
        }
        return;
      }
      if (preorderOnly && !item?.preorderEnabled) {
        return;
      }
      bucket.offers.push(item);
    });

    const restaurants = Array.from(grouped.values()).sort((a, b) => {
      if (sortMode === 'distanceAsc' && a.distanceKm !== b.distanceKm) {
        return a.distanceKm - b.distanceKm;
      }
      return a.firstIndex - b.firstIndex;
    });

    const result = [];
    restaurants.forEach((entry) => {
      if (entry.offers.length) {
        result.push(...entry.offers);
        if (entry.infoCard) {
          result.push(entry.infoCard);
        }
        return;
      }

      if (!preorderOnly && entry.infoCard) {
        result.push(entry.infoCard);
      }
    });

    return result;
  }, [
    offers,
    activeMealSlot,
    preorderOnly,
    selectedCuisineTypes,
    sortMode,
    openingStatusFilter,
    openingDayFilter,
    activePostal,
    searchQueryValid
  ]);
  const filteredOfferCount = useMemo(
    () =>
      filtered.filter(
        (item) =>
          !item?.isRestaurantOnly &&
          (item?.itemSourceType !== 'lunchMenu' || isTodayOnlyLunchMenuItem(item))
      ).length,
    [filtered]
  );
  const filteredRestaurantCount = useMemo(() => {
    const restaurantIds = new Set();
    filtered.forEach((item) => {
      const restaurantId =
        item?.restaurantId || `${item?.restaurant || 'restaurant'}::${item?.address || 'address'}`;
      restaurantIds.add(restaurantId);
    });
    return restaurantIds.size;
  }, [filtered]);
  const filteredOfferItems = useMemo(() => {
    const todayLunchWeekdayKey = getTodayLunchWeekdayKey();
    const offersForCurrentMeal = filtered.filter(
      (item) =>
        !item?.isRestaurantOnly &&
        (item?.itemSourceType !== 'lunchMenu' ||
          isTodayOnlyLunchMenuItem(item, todayLunchWeekdayKey))
    );

    if (offersDietFilter === 'all') return offersForCurrentMeal;

    return offersForCurrentMeal.filter((item) => {
      const tags = Array.isArray(item?.tags)
        ? item.tags.map((tag) => String(tag || '').toLowerCase())
        : [];
      const cuisineTypes = Array.isArray(item?.restaurantCuisineTypes)
        ? item.restaurantCuisineTypes.map((entry) => String(entry || '').toLowerCase())
        : [];
      if (offersDietFilter === 'vegan') {
        return Boolean(item?.restaurantHasVegan) || tags.includes('vegan') || cuisineTypes.some((entry) => entry.includes('vegan'));
      }
      return (
        Boolean(item?.restaurantHasVegetarian) ||
        tags.includes('vegetarian') ||
        cuisineTypes.some((entry) => entry.includes('vegetar'))
      );
    });
  }, [filtered, offersDietFilter]);
  const filteredRestaurantInfoCount = useMemo(
    () => filtered.filter((item) => item?.isRestaurantOnly).length,
    [filtered]
  );
  const foodListItems = useMemo(() => {
    const infoItems = filtered.filter((item) => item?.isRestaurantOnly);
    const items = [];

    const toRestaurantKey = (item) =>
      item?.restaurantId || `${item?.restaurant || 'restaurant'}::${item?.address || 'address'}`;

    const restaurantCapabilities = new Map();
    filtered.forEach((item) => {
      const key = toRestaurantKey(item);
      const current = restaurantCapabilities.get(key) || {
        hasVegan: false,
        hasVegetarian: false,
        hasLunchMenu: false,
        hasCafe: false
      };
      const tags = Array.isArray(item?.tags) ? item.tags : [];
      const cuisineTypes = Array.isArray(item?.restaurantCuisineTypes)
        ? item.restaurantCuisineTypes.map((entry) => String(entry || '').toLowerCase())
        : [];
      current.hasVegan = current.hasVegan || tags.includes('vegan') || cuisineTypes.some((entry) => entry.includes('vegan'));
      current.hasVegetarian =
        current.hasVegetarian ||
        tags.includes('vegetarian') ||
        cuisineTypes.some((entry) => entry.includes('vegetar'));
      current.hasLunchMenu = current.hasLunchMenu || Boolean(item?.restaurantHasLunchMenu);
      const restaurantName = String(item?.restaurant || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      current.hasCafe =
        current.hasCafe ||
        cuisineTypes.some((entry) => entry.normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes('cafe')) ||
        /\bcafe\b/.test(restaurantName);
      restaurantCapabilities.set(key, current);
    });

    const withRestaurantCapabilities = (item) => {
      const capabilities = restaurantCapabilities.get(toRestaurantKey(item));
      if (!capabilities) return item;
      return {
        ...item,
        restaurantHasVegan: capabilities.hasVegan,
        restaurantHasVegetarian: capabilities.hasVegetarian,
        restaurantHasLunchMenu: Boolean(item?.restaurantHasLunchMenu || capabilities.hasLunchMenu),
        restaurantHasCafe: capabilities.hasCafe
      };
    };

    let nearbyRestaurantItems = infoItems.map(withRestaurantCapabilities);
    if (activeMealSlot === 'lunch' || previewEmbedded) {
      nearbyRestaurantItems = nearbyRestaurantItems.filter((item) => {
        if (lunchNearbyFilter === 'lunch') return Boolean(item?.restaurantHasLunchMenu);
        if (lunchNearbyFilter === 'vegan') return Boolean(item?.restaurantHasVegan);
        if (lunchNearbyFilter === 'vegetarian') return Boolean(item?.restaurantHasVegetarian);
        if (lunchNearbyFilter === 'cafe') return Boolean(item?.restaurantHasCafe);
        return true;
      });
    }

    if (nearbyRestaurantItems.length || activeMealSlot === 'lunch' || previewEmbedded) {
      items.push({
        id: 'section-restaurant-info',
        itemType: 'section',
        title: activeMealSlot === 'breakfast' && previewEmbedded ? 'Frühstück in der Nähe' : activeMealSlot === 'lunch' ? 'In der Nähe' : 'Restaurants',
        icon: 'restaurant-outline',
        tone: 'menu',
        showLunchFilters: activeMealSlot === 'lunch' || previewEmbedded
      });
      if (nearbyRestaurantItems.length) {
        items.push(...nearbyRestaurantItems.map((item) => ({ ...item, itemType: 'entry' })));
      }
    }

    return items;
  }, [filtered, activeMealSlot, lunchNearbyFilter, previewEmbedded]);
  const filteredLunchMenuCount = useMemo(
    () =>
      foodListItems.filter(
        (item) => item?.isRestaurantOnly && Boolean(item?.restaurantHasLunchMenu)
      ).length,
    [foodListItems]
  );

  const hasAdvancedFilters =
    preorderOnly ||
    sortMode !== 'none' ||
    selectedCuisineTypes.length > 0 ||
    openingStatusFilter !== 'all' ||
    Boolean(openingDayFilter);

  const statusText = () => {
    if (!activePostal) return 'Stadt oder Postleitzahl eingeben, um Restaurants zu sehen.';
    if (!searchQueryValid) return 'Bitte mindestens 2 Zeichen eingeben (z. B. Ravensburg oder 88212).';
    if (isCateringTab) {
      if (cateringLoading) return 'Lade Catering-Anbieter...';
      if (cateringError) return cateringError;
      return `Gefunden: ${cateringProviders.length} Catering-Anbieter im Umkreis von 10 km.`;
    }
    if (offersLoading) return 'Lade Restaurants...';
    if (offersError) return offersError;
    if (!filtered.length) {
      return `Keine Treffer für ${selectedMealLabel} im Umkreis von ${restaurantRadiusKm} km.`;
    }
    if (activeMealSlot === 'lunch') {
      return `Gefunden: ${filteredLunchMenuCount} Mittagstisch-Restaurants, ${filteredOfferCount} Angebote und ${filteredRestaurantInfoCount} Restaurants für ${selectedMealLabel} im Umkreis von ${restaurantRadiusKm} km.`;
    }
    return `Gefunden: ${filteredOfferCount} Angebote und ${filteredRestaurantInfoCount} Restaurants für ${selectedMealLabel} im Umkreis von ${restaurantRadiusKm} km.`;
  };
  const showRestaurantCount =
    Boolean(activePostal) &&
    searchQueryValid &&
    !isCateringTab &&
    !offersLoading &&
    !offersError;

  const mapPoints = useMemo(() => {
    const byRestaurant = new Map();

    filtered.forEach((item) => {
      const latitude =
        typeof item?.restaurantLat === 'number' ? item.restaurantLat : Number.NaN;
      const longitude =
        typeof item?.restaurantLng === 'number' ? item.restaurantLng : Number.NaN;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

      const key = item?.restaurantId || `${item?.restaurant || 'restaurant'}::${item?.address || 'address'}`;
      if (!byRestaurant.has(key)) {
        byRestaurant.set(key, {
          key,
          latitude,
          longitude,
          restaurant: item?.restaurant || 'Restaurant',
          address: item?.address || '',
          cuisineTypes: Array.isArray(item?.restaurantCuisineTypes)
            ? item.restaurantCuisineTypes
            : [],
          sourceOffer: item
        });
      }
    });

    return Array.from(byRestaurant.values());
  }, [filtered]);

  const mapRegion = useMemo(() => computeMapRegion(mapPoints), [mapPoints]);
  const mapRegionKey = useMemo(
    () =>
      mapPoints.length
        ? mapPoints
            .map((point) => `${point.key}:${point.latitude.toFixed(4)}:${point.longitude.toFixed(4)}`)
            .concat(mapFocusRestaurantKey ? [`focus:${mapFocusRestaurantKey}`] : [])
            .join('|')
        : 'empty',
    [mapPoints, mapFocusRestaurantKey]
  );

  const toggleCuisineFilter = (cuisine) => {
    setSelectedCuisineTypes((prev) => {
      if (prev.includes(cuisine)) {
        return prev.filter((entry) => entry !== cuisine);
      }
      return [...prev, cuisine];
    });
  };

  const handleSearch = () => {
    const value = query.trim();
    setActivePostal(value);
  };

  useEffect(() => {
    if (!activePostal || !searchQueryValid) return;
    if (!isFoodTab && !isCateringTab) return;
    if (isCateringTab) {
      fetchCatering(activePostal, 10);
      return;
    }
    fetchOffers(activePostal, restaurantRadiusKm, activeMealSlot);
  }, [activePostal, searchQueryValid, activeMealSlot, restaurantRadiusKm, isFoodTab, isCateringTab]);

  useEffect(() => {
    if (isFoodTab) return;
    setOffersPageOpen(false);
    setOffersDietFilter('all');
  }, [isFoodTab]);

  const toggleEventTagFilter = (tag) => {
    if (lockedEventTagKey) return;
    setEventTagFilters((prev) =>
      prev.includes(tag) ? prev.filter((entry) => entry !== tag) : [...prev, tag]
    );
  };

  const openEventDateFilterPicker = () => {
    Keyboard.dismiss();
    if (Platform.OS === 'web' && typeof globalThis.prompt === 'function') {
      const raw = globalThis.prompt('Event-Datum im Format JJJJ-MM-TT, leer für alle Events', eventDateFilter);
      if (raw === null) return;
      const next = raw.trim();
      setEventDateFilter(specialClosureDatePattern.test(next) ? next : '');
      return;
    }

    setEventDatePickerState({
      visible: true,
      value: eventDateFilterToDate(eventDateFilter)
    });
  };

  const closeEventDateFilterPicker = () => {
    setEventDatePickerState((prev) => ({ ...prev, visible: false }));
  };

  const applyEventDateFilter = (date) => {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return;
    setEventDateFilter(toDateKey(date));
  };

  const handleEventDateFilterChange = (event, selectedDate) => {
    if (Platform.OS === 'android') {
      if (event?.type === 'set' && selectedDate) {
        applyEventDateFilter(selectedDate);
      }
      closeEventDateFilterPicker();
      return;
    }

    if (selectedDate) {
      setEventDatePickerState((prev) => ({
        ...prev,
        value: selectedDate
      }));
    }
  };

  const confirmEventDateFilter = () => {
    applyEventDateFilter(eventDatePickerState.value);
    closeEventDateFilterPicker();
  };

  const eventTagFilterKey = eventTagFilters.join('|');

  const submitEventLocationSearch = () => {
    const eventLocation = eventLocationQuery.trim();
    setActiveEventLocationQuery(eventLocation.length >= 2 ? eventLocation : '');
    Keyboard.dismiss();
  };

  const clearEventLocationSearch = () => {
    setEventLocationQuery('');
    setActiveEventLocationQuery('');
  };

  useEffect(() => {
    if (!eventsEnabled || activeFooterTab !== 'events' || eventLocationInitializedRef.current) return;
    const inheritedLocation = activePostal.trim();
    if (inheritedLocation.length < 2) return;
    eventLocationInitializedRef.current = true;
    setEventLocationQuery(inheritedLocation);
  }, [activeFooterTab, activePostal]);

  useEffect(() => {
    if (!eventsEnabled || activeFooterTab !== 'events') return;
    if (activeEventLocationQuery.trim().length < 2) return;
    fetchEvents({
      locationQuery: activeEventLocationQuery,
      radiusKm: eventRadiusKm,
      date: eventDateFilter.trim(),
      tags: eventTagFilters
    });
  }, [activeFooterTab, activeEventLocationQuery, eventDateFilter, eventRadiusKm, eventTagFilterKey]);

  useEffect(() => {
    if (!eventNotification?.id || !eventNotification?.eventId) return;
    let active = true;
    void getPublicEvent(eventNotification.eventId, eventNotification.occurrenceStartAt)
      .then((event) => {
        if (!active || !event?.id) return;
        setActiveFooterTab('events');
        handleOpenEvent(event);
      })
      .catch(() => {
        if (active) showEventFollowMessage('Dieses Event ist nicht mehr verfügbar.');
      })
      .finally(() => {
        if (active) onEventNotificationHandled?.();
      });
    return () => {
      active = false;
    };
  }, [eventNotification?.id]);

  const handleOpenEvent = (event) => {
    if (!event?.id) return;
    setSelectedEvent(event);
    const providerId = String(event?.provider?.id || '').trim();
    if (providerId) {
      void trackPublicRestaurantContentView(providerId, {
        type: 'event',
        contentId: String(event.id)
      });
    }
  };

  useEffect(() => {
    if (!initialSelection?.type || !initialSelection?.target) return;
    const target = initialSelection.target;
    if (initialSelection.type === 'event') {
      setActiveFooterTab('events');
      setSelectedEvent(target);
      return;
    }

    const restaurant = initialSelection.type === 'restaurant' ? target : target.restaurant || {};
    const restaurantId = String(restaurant.id || target.restaurantId || initialSelection.targetId || '');
    const sharedRestaurantFields = {
      restaurantId,
      restaurant: restaurant.name || target.restaurant || target.title || 'Restaurant',
      address: restaurant.address || target.address || '',
      postalCode: restaurant.postalCode || target.postalCode || '',
      phone: restaurant.phone || target.phone || '',
      restaurantLat: Number.isFinite(Number(restaurant.lat)) ? Number(restaurant.lat) : undefined,
      restaurantLng: Number.isFinite(Number(restaurant.lng)) ? Number(restaurant.lng) : undefined,
      restaurantMealSlots: restaurant.mealSlots || [],
      restaurantOpeningHours: restaurant.openingHours || {},
      restaurantSpecialClosures: restaurant.specialClosures || [],
      restaurantCuisineTypes: restaurant.cuisineTypes || [],
      restaurantSocialLinks: restaurant.socialLinks || [],
      restaurantAboutText: restaurant.aboutText || '',
      restaurantLogoUrl: restaurant.logoUrl || '',
      restaurantMenuUrl: restaurant.menuUrl || '',
      restaurantMenuMimeType: restaurant.menuMimeType || '',
      restaurantReservationMode: restaurant.reservationMode || 'none',
      restaurantReservationExternalLink: restaurant.reservationExternalLink || '',
      restaurantReservationExternalEmail: restaurant.reservationExternalEmail || '',
      restaurantReservationExternalPhone: restaurant.reservationExternalPhone || ''
    };
    setActiveFooterTab('food');
    if (initialSelection.type === 'restaurant') {
      setSelectedOffer({
        id: `restaurant-${restaurantId}-preview`,
        offerId: null,
        isRestaurantOnly: true,
        title: restaurant.name || initialSelection.title || 'Restaurant',
        description: restaurant.aboutText || initialSelection.description || '',
        price: null,
        active: true,
        ...sharedRestaurantFields
      });
      setRestaurantInfoOpen(true);
      return;
    }
    setSelectedOffer({
      id: target.id,
      offerId: target.id,
      title: target.title,
      description: target.description,
      price: target.price,
      tags: target.tags || [],
      imageUrl: target.imageUrl || '',
      imageUri: target.imageUrl || '',
      mealSlot: target.mealSlot || 'lunch',
      active: target.active !== false,
      preorderEnabled: Boolean(target.preorderEnabled),
      ...sharedRestaurantFields
    });
    setRestaurantInfoOpen(false);
  }, [initialSelection?.id, initialSelection?.type, initialSelection?.targetId]);

  const showEventFollowMessage = (message) => {
    setEventFollowMessage(message);
    if (eventFollowMessageTimerRef.current) clearTimeout(eventFollowMessageTimerRef.current);
    eventFollowMessageTimerRef.current = setTimeout(() => setEventFollowMessage(''), 3500);
  };

  const isFollowingEventProvider = (event) => {
    const providerId = String(event?.providerId || event?.provider?.id || '').trim();
    return Boolean(providerId && eventFavoriteIds.includes(providerId));
  };

  const handleEventFavoritePress = (event) => {
    if (!event?.id) return;
    if (isFollowingEventProvider(event)) {
      setEventFollowBusy(true);
      void unfollowEventProvider(event).then((result) => {
        if (result?.ok) {
          showEventFollowMessage('Du erhältst keine neuen Event-Benachrichtigungen mehr.');
        } else {
          showEventFollowMessage(result?.message || 'Benachrichtigungen konnten nicht geändert werden.');
        }
      }).finally(() => setEventFollowBusy(false));
      return;
    }
    setEventFollowConfirmation(event);
  };

  const confirmEventFollow = async () => {
    if (!eventFollowConfirmation || eventFollowBusy) return;
    setEventFollowBusy(true);
    const result = await followEventProvider(eventFollowConfirmation);
    setEventFollowBusy(false);
    setEventFollowConfirmation(null);
    if (result?.ok) {
      showEventFollowMessage(`Du folgst jetzt ${eventFollowConfirmation?.provider?.name || 'diesem Veranstalter'}.`);
      return;
    }
    if (result?.permissionDenied) {
      setEventNotificationPermissionDenied(true);
      return;
    }
    showEventFollowMessage(result?.message || 'Benachrichtigungen konnten nicht eingerichtet werden.');
  };

  const handleShareEvent = async (event) => {
    if (!event?.id) return;
    const url = eventShareUrl(event);
    const message = `${event.title || 'Event'} – ${formatEventDateTime(
      event.occurrenceStartAt || event.startAt
    )}\n${url}`;
    try {
      if (Platform.OS === 'web') {
        if (globalThis.navigator?.share) {
          await globalThis.navigator.share({ title: event.title || 'Event', text: message, url });
        } else if (globalThis.navigator?.clipboard) {
          await globalThis.navigator.clipboard.writeText(url);
        }
        return;
      }
      await Share.share({ title: event.title || 'Event', message, url });
    } catch {
      // Closing the native share sheet is not an application error.
    }
  };

  const handleShareOffer = async (offer) => {
    const url = offerShareUrl(offer);
    if (!url) return;
    const price = Number.isFinite(Number(offer.price)) && Number(offer.price) > 0 ? formatPrice(offer.price) : '';
    const message = [
      offer.title || 'Angebot',
      price,
      offer.restaurant || '',
      [offer.address, offer.postalCode].filter(Boolean).join(', '),
      url
    ]
      .filter(Boolean)
      .join('\n');
    try {
      if (Platform.OS === 'web') {
        if (globalThis.navigator?.share) {
          await globalThis.navigator.share({ title: offer.title || 'Angebot', text: message, url });
        } else if (globalThis.navigator?.clipboard) {
          await globalThis.navigator.clipboard.writeText(url);
        }
        return;
      }
      await Share.share({ title: offer.title || 'Angebot', message, url });
    } catch {
      // Closing the native share sheet is not an application error.
    }
  };

  useEffect(() => {
    if (Platform.OS === 'web') return undefined;
    let active = true;
    const openSharedUrl = async (url) => {
      const legacyOfferMatch = String(url || '').match(/\/events\/offer\/([^/?#]+)/i);
      const eventMatch = String(url || '').match(/\/events\/([^/?#]+)/i);
      const offerMatch = String(url || '').match(/\/offers\/([^/?#]+)/i);
      if (!legacyOfferMatch && !eventMatch && !offerMatch) return;
      try {
        const parsed = new URL(String(url));
        if (legacyOfferMatch || offerMatch) {
          const offer = await getPublicOffer(decodeURIComponent((legacyOfferMatch || offerMatch)[1]));
          if (!active || !offer?.id) return;
          setActiveFooterTab('food');
          handleOpenOffer(offer);
          return;
        }
        if (eventMatch) {
          if (!eventsEnabled) return;
          const event = await getPublicEvent(
            decodeURIComponent(eventMatch[1]),
            parsed.searchParams.get('occurrenceStartAt') || ''
          );
          if (!active || !event?.id) return;
          setActiveFooterTab('events');
          handleOpenEvent(event);
          return;
        }

      } catch {
        // Invalid or expired shared links stay on the normal user view.
      }
    };

    void Linking.getInitialURL().then(openSharedUrl);
    const subscription = Linking.addEventListener('url', ({ url }) => {
      void openSharedUrl(url);
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  const hasValidEventLocation = activeEventLocationQuery.trim().length >= 2;

  const sortedEvents = useMemo(() => {
    const favoriteSet = new Set(eventFavoriteIds);
    const todayKey = new Date().toISOString().slice(0, 10);
    return [...(events || [])].sort((a, b) => {
      const aFavorite = favoriteSet.has(a.providerId || a?.provider?.id) ? 0 : 1;
      const bFavorite = favoriteSet.has(b.providerId || b?.provider?.id) ? 0 : 1;
      if (aFavorite !== bFavorite) return aFavorite - bFavorite;
      const aStart = a.occurrenceStartAt || a.startAt || '';
      const bStart = b.occurrenceStartAt || b.startAt || '';
      const aToday = String(aStart).slice(0, 10) === todayKey ? 0 : 1;
      const bToday = String(bStart).slice(0, 10) === todayKey ? 0 : 1;
      if (aToday !== bToday) return aToday - bToday;
      return Date.parse(aStart) - Date.parse(bStart);
    });
  }, [events, eventFavoriteIds]);

  const eventSearchStatus = useMemo(() => {
    if (!hasValidEventLocation) return 'Ort oder PLZ eingeben und auf Suchen tippen.';
    if (eventsLoading) return 'Events werden gesucht ...';
    if (eventsError) return eventsError;
    return `${sortedEvents.length} ${sortedEvents.length === 1 ? 'Event' : 'Events'} im Umkreis von ${eventRadiusKm} km.`;
  }, [eventRadiusKm, eventsError, eventsLoading, hasValidEventLocation, sortedEvents.length]);

  const overlayOpacity = modalAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.4] });
  const modalCardStyle = {
    opacity: modalAnim,
    transform: [
      {
        translateY: modalAnim.interpolate({ inputRange: [0, 1], outputRange: [50, 0] })
      },
      {
        scale: modalAnim.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1] })
      }
    ]
  };
  const menuOverlayOpacity = menuAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.42] });
  const menuPanelStyle = {
    transform: [
      {
        translateX: menuAnim.interpolate({ inputRange: [0, 1], outputRange: [320, 0] })
      }
    ]
  };
  const compactHeaderStyle = {
    opacity: compactHeaderAnim,
    transform: [
      {
        translateY: compactHeaderAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [-16, 0]
        })
      }
    ]
  };
  const selectedOfferImage = selectedOffer?.imageUrl || selectedOffer?.imageUri;
  const selectedOfferInitial = selectedOffer?.title
    ? selectedOffer.title.slice(0, 1).toUpperCase()
    : 'M';
  const selectedOfferIsRestaurantOnly = Boolean(selectedOffer?.isRestaurantOnly);
  const selectedOfferIsLunchMenu = selectedOffer?.itemSourceType === 'lunchMenu';
  const selectedOfferIsOrderable = Boolean(selectedOffer && !selectedOfferIsRestaurantOnly && !selectedOfferIsLunchMenu);
  const selectedOpeningHoursRows = useMemo(
    () => getOpeningHoursRows(selectedOffer?.restaurantOpeningHours),
    [selectedOffer?.restaurantOpeningHours]
  );
  const selectedSpecialClosures = useMemo(
    () => normalizeSpecialClosures(selectedOffer?.restaurantSpecialClosures),
    [selectedOffer?.restaurantSpecialClosures]
  );
  const selectedReservationMode = normalizeReservationMode(
    selectedOffer?.restaurantReservationMode,
    Boolean(selectedOffer?.restaurantTableReservationEnabled)
  );
  const selectedReservationExternalLink = String(selectedOffer?.restaurantReservationExternalLink || '').trim();
  const selectedReservationExternalEmail = String(selectedOffer?.restaurantReservationExternalEmail || '').trim();
  const selectedReservationExternalPhone = String(selectedOffer?.restaurantReservationExternalPhone || '').trim();
  const hasExternalReservationAction = Boolean(
    selectedReservationExternalLink || selectedReservationExternalEmail || selectedReservationExternalPhone
  );
  const selectedRestaurantAboutText = String(selectedOffer?.restaurantAboutText || '').trim();
  const selectedRestaurantAboutPreview = useMemo(
    () => createRestaurantAboutPreview(selectedRestaurantAboutText),
    [selectedRestaurantAboutText]
  );
  const showRestaurantAboutToggle = selectedRestaurantAboutPreview.truncated;
  const visibleRestaurantAboutText =
    restaurantAboutExpanded || !showRestaurantAboutToggle
      ? selectedRestaurantAboutText
      : selectedRestaurantAboutPreview.text;
  const selectedRestaurantLogoUrl = String(selectedOffer?.restaurantLogoUrl || '').trim();
  const selectedRestaurantLogoSource = selectedRestaurantLogoUrl
    ? { uri: selectedRestaurantLogoUrl }
    : null;
  const selectedRestaurantSocialLinks = Array.isArray(selectedOffer?.restaurantSocialLinks)
    ? selectedOffer.restaurantSocialLinks
    : [];
  const hasRestaurantLunchMenu = Boolean(selectedOffer?.restaurantHasLunchMenu);
  const hasRestaurantDigitalMenu = Boolean(selectedOffer?.restaurantHasDigitalMenu);
  const hasRestaurantPdfMenu = Boolean(
    selectedOffer?.restaurantMenuUrl &&
      String(selectedOffer?.restaurantMenuMimeType || '').toLowerCase() === 'application/pdf'
  );
  const hasRegularMenu = hasRestaurantDigitalMenu || hasRestaurantPdfMenu;
  const hasBothRegularMenus = hasRestaurantDigitalMenu && hasRestaurantPdfMenu;
  const showLunchMenuButton = hasRestaurantLunchMenu || lunchMenuItems.length > 0;
  const showRestaurantInfoPanel = restaurantInfoOpen || selectedOfferIsRestaurantOnly;
  const offerModalCardStyles = [
    styles.offerModalCard,
    modalCardStyle,
    selectedOfferIsRestaurantOnly && styles.offerModalCardSimpleInfo
  ];
  const selectedReviewCount = restaurantReviews.length || Number(selectedOffer?.restaurantRatingCount || 0);
  const selectedRatingAverage = restaurantReviews.length
    ? restaurantReviews.reduce((sum, review) => sum + Number(review?.rating || 0), 0) / restaurantReviews.length
    : Number(selectedOffer?.restaurantRatingAverage || 0);
  const orderMealSlot = selectedOffer?.mealSlot || activeMealSlot || 'lunch';
  const orderDefaultMinutes = mealSlotDefaultMinutes[orderMealSlot] ?? mealSlotDefaultMinutes.lunch;
  const orderDefaultTime = toTimeLabel(orderDefaultMinutes);
  const selectedLunchMenuAvailability = formatLunchMenuSchedule(selectedOffer);

  useEffect(() => {
    setRestaurantAboutExpanded(false);
  }, [selectedOffer?.restaurantId, selectedRestaurantAboutText]);

  const orderTimeOptions = useMemo(() => {
    const beforeAfterWindow = 4 * 60;
    const rawStart = Math.max(0, orderDefaultMinutes - beforeAfterWindow);
    const rawEnd = Math.min(23 * 60 + 45, orderDefaultMinutes + beforeAfterWindow);
    const start = rawStart - (rawStart % timeStepMinutes);
    const times = [];

    for (let minute = start; minute <= rawEnd; minute += timeStepMinutes) {
      times.push(toTimeLabel(minute));
    }

    return times;
  }, [orderDefaultMinutes]);
  const reservationDateOptions = useMemo(() => {
    const options = [];
    const now = new Date();
    for (let offset = 0; offset < 7; offset += 1) {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
      const key = toDateKey(date);
      const specialClosure = selectedSpecialClosures.find((entry) => entry.date === key) || null;
      options.push({
        key,
        label: date.toLocaleDateString('de-DE', {
          weekday: 'short',
          day: '2-digit',
          month: '2-digit'
        }),
        disabled: Boolean(specialClosure),
        reason: specialClosure?.reason || ''
      });
    }
    return options;
  }, [selectedSpecialClosures]);
  const selectedReservationClosure =
    reservationDateOptions.find((option) => option.key === reservationDate && option.disabled) || null;
  const visibleSpecialClosures = useMemo(() => {
    const todayKey = toDateKey(new Date());
    return selectedSpecialClosures.filter((entry) => entry.date >= todayKey);
  }, [selectedSpecialClosures]);
  const groupedDigitalMenuItems = useMemo(() => {
    const grouped = new Map();

    for (const item of digitalMenuItems) {
      const category = normalizeDigitalMenuCategory(item?.category, item?.section, item?.name, item?.description);
      if (digitalMenuDietFilter === 'all' && category === 'Getränke') continue;
      if (digitalMenuDietFilter === 'vegan' && category !== 'Vegan') continue;
      if (digitalMenuDietFilter === 'vegetarian' && category !== 'Vegetarisch') continue;
      if (digitalMenuDietFilter === 'drinks' && category !== 'Getränke') continue;

      const section = normalizeDigitalMenuSection(item?.section, category);
      if (!grouped.has(section)) {
        grouped.set(section, []);
      }
      grouped.get(section).push({
        ...item,
        category,
        section,
        allergens: normalizeItemAllergenList(item?.allergens)
      });
    }

    return Array.from(grouped.entries()).map(([section, items]) => ({
      section,
      items
    }));
  }, [digitalMenuDietFilter, digitalMenuItems]);

  const groupedLunchMenuItems = useMemo(() => {
    const grouped = new Map();

    for (const item of lunchMenuItems) {
      const category = normalizeDigitalMenuCategory(item?.category, item?.section, item?.name, item?.description);
      const section = normalizeDigitalMenuSection(item?.section, category);
      if (!grouped.has(section)) {
        grouped.set(section, []);
      }
      grouped.get(section).push({
        ...item,
        category,
        section,
        allergens: normalizeItemAllergenList(item?.allergens)
      });
    }

    return Array.from(grouped.entries()).map(([section, items]) => ({
      section,
      items
    }));
  }, [lunchMenuItems]);

  const centerOrderTimeSelection = (time, animated = false) => {
    const index = orderTimeOptions.indexOf(time);
    if (index < 0 || !orderTimeScrollRef.current?.scrollTo) return;

    const itemStride = 64 + spacing.xs;
    const targetX = Math.max(0, index * itemStride - itemStride * 2);
    orderTimeScrollRef.current.scrollTo({ x: targetX, animated });
  };

  useEffect(() => {
    if (!selectedOffer) return;

    if (!orderTime || !orderTimeOptions.includes(orderTime)) {
      setOrderTime(orderDefaultTime);
      return;
    }

    const timer = setTimeout(() => {
      centerOrderTimeSelection(orderTime, false);
    }, 70);

    return () => clearTimeout(timer);
  }, [selectedOffer, orderTime, orderTimeOptions, orderDefaultTime]);

  useEffect(() => {
    if (!selectedOffer) return;
    const firstAvailableDate =
      reservationDateOptions.find((option) => !option.disabled)?.key ||
      reservationDateOptions[0]?.key ||
      toDateKey(new Date());
    const selectedDateAvailable = reservationDateOptions.some(
      (option) => option.key === reservationDate && !option.disabled
    );
    if (!reservationDate || !selectedDateAvailable) {
      setReservationDate(firstAvailableDate);
    }
  }, [selectedOffer, reservationDate, reservationDateOptions]);

  const resetReviewComposer = () => {
    setReviewRating(0);
    setReviewText('');
    setReviewAuthorName('');
    setReviewImages([]);
    setReviewError('');
    setReviewStatus('');
  };

  const loadRestaurantReviewsForOffer = async (offer = selectedOffer) => {
    if (!offer?.restaurantId) {
      setRestaurantReviews([]);
      return;
    }

    const requestId = reviewsRequestRef.current + 1;
    reviewsRequestRef.current = requestId;
    setReviewsLoading(true);
    setReviewsError('');
    try {
      const response = await getPublicRestaurantReviews(offer.restaurantId);
      if (reviewsRequestRef.current !== requestId) return;
      const reviews = Array.isArray(response)
        ? response
        : Array.isArray(response?.reviews)
        ? response.reviews
        : [];
      setRestaurantReviews(reviews);
    } catch (error) {
      if (reviewsRequestRef.current !== requestId) return;
      setRestaurantReviews([]);
      setReviewsError(error?.message || 'Bewertungen konnten nicht geladen werden.');
    } finally {
      if (reviewsRequestRef.current === requestId) {
        setReviewsLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!showRestaurantInfoPanel || !selectedOffer?.restaurantId) return;
    loadRestaurantReviewsForOffer(selectedOffer);
  }, [showRestaurantInfoPanel, selectedOffer?.restaurantId]);

  const handleOpenOffer = (offer) => {
    const mealSlot = offer?.mealSlot || activeMealSlot || 'lunch';
    const defaultMinutes = mealSlotDefaultMinutes[mealSlot] ?? mealSlotDefaultMinutes.lunch;
    const defaultTime = toTimeLabel(defaultMinutes);

    setSelectedOffer(offer);
    setOrderName('');
    setOrderQty('1');
    setOrderTime(defaultTime);
    setOrderType('pickup');
    setOrderLocalError('');
    setLunchMenuItems([]);
    setLunchMenuAllergens([]);
    setLunchMenuUpdatedAt(null);
    setLunchMenuError('');
    setLunchMenuVisible(false);
    setLunchMenuLoading(false);
    setDigitalMenuItems([]);
    setDigitalMenuAllergens([]);
    setDigitalMenuUpdatedAt(null);
    setDigitalMenuError('');
    setDigitalMenuVisible(false);
    setDigitalMenuLoading(false);
    setRegularMenuLinksVisible(false);
    setDigitalMenuDietFilter('all');
    setReservationName('');
    setReservationEmail('');
    setReservationPhone('');
    setReservationPartySize('2');
    setReservationDate(toDateKey(new Date()));
    setReservationTime(defaultTime);
    setReservationNote('');
    setReservationLocalError('');
    setPreorderPanelOpen(false);
    setReservationPanelOpen(false);
    setReservationInfoPanelOpen(false);
    setRestaurantReviews([]);
    setReviewsError('');
    setReviewsLoading(false);
    setReviewComposerOpen(false);
    setRestaurantAboutExpanded(false);
    resetReviewComposer();
    setRestaurantInfoOpen(Boolean(offer?.isRestaurantOnly));
    setIsOfferHeaderCompact(false);
    offerCompactRef.current = false;
    const offerId = String(offer?.offerId || '').trim();
    if (offerId && !offer?.isRestaurantOnly && offer?.itemSourceType !== 'lunchMenu') {
      void trackPublicRestaurantContentView(offer.restaurantId, { type: 'offer', contentId: offerId });
    }
  };

  const handleOpenPublicMenuItem = (item, menuKind) => {
    if (!item?.id || !selectedOffer?.restaurantId) return;
    setSelectedMenuItem({ ...item, menuKind: menuKind === 'lunch' ? 'lunch' : 'regular' });
    void trackPublicRestaurantContentView(selectedOffer.restaurantId, {
      type: 'dish',
      contentId: String(item.id),
      menuKind: menuKind === 'lunch' ? 'lunch' : 'regular'
    });
  };

  const selectedMenuItemOffer = useMemo(() => {
    if (!selectedMenuItem || !selectedOffer?.restaurantId) return null;
    const itemPrice = Number(selectedMenuItem.price);
    return (
      offers.find(
        (offer) =>
          offer?.restaurantId === selectedOffer.restaurantId &&
          offer?.active !== false &&
          String(offer?.title || '').trim().toLowerCase() === String(selectedMenuItem.name || '').trim().toLowerCase() &&
          Number(offer?.price) === itemPrice
      ) || null
    );
  }, [offers, selectedMenuItem, selectedOffer?.restaurantId]);

  const handlePreorderMenuItem = () => {
    if (!selectedMenuItemOffer) return;
    setSelectedMenuItem(null);
    handleOpenOffer(selectedMenuItemOffer);
    setTimeout(() => setPreorderPanelOpen(true), 0);
  };

  const handleOpenRestaurantInfoFromList = (offer) => {
    if (!offer) return;
    handleOpenOffer(offer);
    setRestaurantInfoOpen(true);
  };

  const handleOpenLunchRestaurant = (offer) => {
    if (!offer) return;
    handleOpenOffer(offer);
    setRestaurantInfoOpen(true);
    void loadLunchMenuForOffer(offer, { allowToggle: false });
  };

  const handleShowRestaurantOnMap = (offer) => {
    if (!offer) return;
    const latitude = Number(offer.restaurantLat);
    const longitude = Number(offer.restaurantLng);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    const restaurantKey =
      offer.restaurantId || `${offer?.restaurant || 'restaurant'}::${offer?.address || 'address'}`;
    setMapFocusRestaurantKey(restaurantKey);
    setActiveFooterTab('map');
  };

  const handleCloseOffer = () => {
    setRestaurantInfoOpen(false);
    Animated.timing(modalAnim, {
      toValue: 0,
      duration: 200,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: canUseNativeDriver
    }).start(() => {
      setSelectedOffer(null);
      setIsOfferHeaderCompact(false);
      offerCompactRef.current = false;
      setLunchMenuError('');
      setLunchMenuItems([]);
      setLunchMenuAllergens([]);
      setLunchMenuUpdatedAt(null);
      setLunchMenuVisible(false);
      setDigitalMenuError('');
      setDigitalMenuItems([]);
      setDigitalMenuAllergens([]);
      setDigitalMenuUpdatedAt(null);
      setDigitalMenuVisible(false);
      setRegularMenuLinksVisible(false);
      setDigitalMenuDietFilter('all');
      setReservationLocalError('');
      setPreorderPanelOpen(false);
      setReservationPanelOpen(false);
      setReservationInfoPanelOpen(false);
      setRestaurantReviews([]);
      setReviewsError('');
      setReviewsLoading(false);
      setReviewComposerOpen(false);
      setRestaurantAboutExpanded(false);
      resetReviewComposer();
    });
  };

  const handleOfferScroll = (event) => {
    const y = event.nativeEvent.contentOffset?.y ?? 0;
    if (!offerCompactRef.current && y > 68) {
      offerCompactRef.current = true;
      setIsOfferHeaderCompact(true);
      return;
    }

    if (offerCompactRef.current && y < 24) {
      offerCompactRef.current = false;
      setIsOfferHeaderCompact(false);
    }
  };

  const handleOpenReviewComposer = () => {
    if (!selectedOffer?.restaurantId) return;
    resetReviewComposer();
    setReviewComposerOpen(true);
  };

  const handlePickReviewImages = async () => {
    if (reviewImages.length >= 5) {
      setReviewError('Maximal 5 Bilder pro Bewertung.');
      return;
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.82,
        allowsEditing: false,
        allowsMultipleSelection: true,
        selectionLimit: Math.max(1, 5 - reviewImages.length),
        legacy: false
      });

      if (result.canceled) return;
      const picked = (result.assets || [])
        .slice(0, 5 - reviewImages.length)
        .map((asset, index) => ({
          uri: asset.uri,
          file: asset.file,
          name: asset.fileName || asset.name || `bewertung-${Date.now()}-${index + 1}.jpg`,
          mimeType: asset.mimeType || asset.type || 'image/jpeg'
        }))
        .filter((asset) => asset.uri || asset.file);

      if (!picked.length) return;
      setReviewImages((prev) => [...prev, ...picked].slice(0, 5));
      setReviewError('');
    } catch (error) {
      setReviewError(error?.message || 'Bilder konnten nicht ausgewählt werden.');
    }
  };

  const handleSubmitReview = async () => {
    if (!selectedOffer?.restaurantId || reviewSubmitting) return;
    const text = reviewText.trim();
    const authorName = reviewAuthorName.trim();

    if (reviewRating < 1 || reviewRating > 5) {
      setReviewError('Bitte Sterne auswählen.');
      setReviewStatus('');
      return;
    }

    if (text.length < 2) {
      setReviewError('Bitte kurz beschreiben, wie es war.');
      setReviewStatus('');
      return;
    }

    setReviewSubmitting(true);
    setReviewError('');
    setReviewStatus('');
    try {
      const response = await createRestaurantReview(selectedOffer.restaurantId, {
        rating: reviewRating,
        text,
        authorName,
        images: reviewImages
      });
      const createdReview = response?.review || response;
      if (createdReview?.id) {
        setRestaurantReviews((prev) => [createdReview, ...prev.filter((review) => review.id !== createdReview.id)]);
      } else {
        await loadRestaurantReviewsForOffer(selectedOffer);
      }
      setReviewStatus('Danke, deine Bewertung ist veröffentlicht.');
      setReviewComposerOpen(false);
      resetReviewComposer();
    } catch (error) {
      setReviewError(error?.message || 'Bewertung konnte nicht gesendet werden.');
    } finally {
      setReviewSubmitting(false);
    }
  };

  const handleOpenRestaurantInfo = () => {
    if (!selectedOffer) return;
    setReviewError('');
    setReviewStatus('');
    setRestaurantInfoOpen(true);
  };

  const handleCloseRestaurantInfo = () => {
    if (selectedOffer?.isRestaurantOnly) {
      handleCloseOffer();
      return;
    }
    setRestaurantInfoOpen(false);
    setLunchMenuVisible(false);
    setSelectedMenuItem(null);
    setLunchMenuError('');
    setRegularMenuLinksVisible(false);
    setDigitalMenuVisible(false);
    setDigitalMenuError('');
    setDigitalMenuDietFilter('all');
    setReservationInfoPanelOpen(false);
    setReviewComposerOpen(false);
    setRestaurantAboutExpanded(false);
    resetReviewComposer();
  };

  const handleCallRestaurant = async () => {
    const telUrl = normalizePhoneLink(selectedOffer?.phone);
    if (!telUrl) return;
    try {
      await Linking.openURL(telUrl);
    } catch {
      // Keep the info modal open if the platform cannot open tel: links.
    }
  };

  const handleOpenRestaurantMenu = async () => {
    setRegularMenuLinksVisible(false);
    const menuUrl = selectedOffer?.restaurantMenuUrl;
    if (!menuUrl) return;
    try {
      const supported = await Linking.canOpenURL(menuUrl);
      if (!supported) return;
      await Linking.openURL(menuUrl);
      void trackPublicRestaurantMenuView(selectedOffer.restaurantId, 'regular');
    } catch {
      // Ignore open failures and keep modal usable.
    }
  };

  const loadLunchMenuForOffer = async (offer, options = {}) => {
    const allowToggle = options.allowToggle !== false;
    if (!offer?.restaurantId) return;
    setRegularMenuLinksVisible(false);
    if (allowToggle && lunchMenuVisible) {
      setLunchMenuVisible(false);
      setLunchMenuError('');
      return;
    }

    if (allowToggle && lunchMenuItems.length) {
      setLunchMenuVisible(true);
      setLunchMenuError('');
      setDigitalMenuVisible(false);
      setDigitalMenuError('');
      void trackPublicRestaurantMenuView(offer.restaurantId, 'lunch');
      return;
    }

    setLunchMenuLoading(true);
    setLunchMenuError('');
    try {
      const response = await getPublicRestaurantLunchMenu(offer.restaurantId);
      const items = Array.isArray(response?.menu?.items) ? response.menu.items : [];
      const allergens = Array.isArray(response?.menu?.allergens)
        ? response.menu.allergens.map((entry) => String(entry || '').trim()).filter(Boolean)
        : [];
      setLunchMenuItems(items);
      setLunchMenuAllergens(allergens);
      setLunchMenuUpdatedAt(response?.updatedAt || null);
      if (!items.length) {
        setLunchMenuVisible(false);
        setLunchMenuError('Kein Mittagstisch-Menü vorhanden.');
      } else {
        setLunchMenuVisible(true);
        setDigitalMenuVisible(false);
        setDigitalMenuError('');
        void trackPublicRestaurantMenuView(offer.restaurantId, 'lunch');
      }
    } catch (error) {
      setLunchMenuItems([]);
      setLunchMenuAllergens([]);
      setLunchMenuUpdatedAt(null);
      setLunchMenuVisible(false);
      setLunchMenuError(error?.message || 'Mittagstisch-Menü konnte nicht geladen werden.');
    } finally {
      setLunchMenuLoading(false);
    }
  };

  const handleLoadLunchMenu = async () => {
    await loadLunchMenuForOffer(selectedOffer, { allowToggle: true });
  };

  const handleLoadDigitalMenu = async () => {
    if (!selectedOffer?.restaurantId) return;
    setRegularMenuLinksVisible(false);
    if (digitalMenuVisible) {
      setDigitalMenuVisible(false);
      setDigitalMenuError('');
      return;
    }

    if (digitalMenuItems.length) {
      setDigitalMenuDietFilter('all');
      setDigitalMenuVisible(true);
      setDigitalMenuError('');
      setLunchMenuVisible(false);
      setLunchMenuError('');
      void trackPublicRestaurantMenuView(selectedOffer.restaurantId, 'regular');
      return;
    }

    setDigitalMenuLoading(true);
    setDigitalMenuError('');
    try {
      const response = await getPublicRestaurantDigitalMenu(selectedOffer.restaurantId);
      const items = Array.isArray(response?.menu?.items) ? response.menu.items : [];
      const allergens = Array.isArray(response?.menu?.allergens)
        ? response.menu.allergens.map((entry) => String(entry || '').trim()).filter(Boolean)
        : [];
      setDigitalMenuItems(items);
      setDigitalMenuAllergens(allergens);
      setDigitalMenuUpdatedAt(response?.updatedAt || null);
      setDigitalMenuDietFilter('all');
      if (!items.length) {
        setDigitalMenuVisible(false);
        setDigitalMenuError('Für dieses Restaurant ist aktuell kein digitales Menü veröffentlicht.');
      } else {
        setDigitalMenuVisible(true);
        setLunchMenuVisible(false);
        setLunchMenuError('');
        void trackPublicRestaurantMenuView(selectedOffer.restaurantId, 'regular');
      }
    } catch (error) {
      setDigitalMenuItems([]);
      setDigitalMenuAllergens([]);
      setDigitalMenuUpdatedAt(null);
      setDigitalMenuVisible(false);
      setDigitalMenuError(error?.message || 'Digitales Menü konnte nicht geladen werden.');
    } finally {
      setDigitalMenuLoading(false);
    }
  };

  const handleOpenRegularMenu = async () => {
    setLunchMenuError('');
    if (!hasRegularMenu) {
      setDigitalMenuError('Für dieses Restaurant ist aktuell kein Menü hinterlegt.');
      return;
    }

    if (hasBothRegularMenus) {
      setLunchMenuVisible(false);
      setDigitalMenuVisible(false);
      setDigitalMenuError('');
      setRegularMenuLinksVisible((prev) => !prev);
      return;
    }

    setRegularMenuLinksVisible(false);
    if (hasRestaurantDigitalMenu) {
      await handleLoadDigitalMenu();
      return;
    }
    await handleOpenRestaurantMenu();
  };

  const buildReservationIso = () => {
    const dateText = reservationDate.trim();
    const timeText = reservationTime.trim();
    if (!dateText || !timeText) return null;
    const match = /^(\d{1,2}):(\d{2})$/.exec(timeText);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    const parsedDate = new Date(`${dateText}T00:00:00`);
    if (Number.isNaN(parsedDate.getTime())) return null;
    const reservationDateTime = new Date(
      parsedDate.getFullYear(),
      parsedDate.getMonth(),
      parsedDate.getDate(),
      hours,
      minutes,
      0,
      0
    );
    return reservationDateTime.toISOString();
  };

  const handleSendReservation = async () => {
    if (!selectedOffer?.restaurantId) return;
    const name = reservationName.trim();
    const email = reservationEmail.trim().toLowerCase();
    const partySize = Number(reservationPartySize);
    const reservationIso = buildReservationIso();

    if (!name || !emailPattern.test(email) || !Number.isFinite(partySize) || partySize <= 0 || !reservationIso) {
      setReservationLocalError('Bitte Name, E-Mail, Personenanzahl, Datum und Uhrzeit korrekt auswählen.');
      return;
    }
    if (selectedReservationClosure) {
      setReservationLocalError(`An diesem Tag geschlossen: ${selectedReservationClosure.reason}`);
      return;
    }

    setReservationLocalError('');
    await placeTableReservation({
      restaurantId: selectedOffer.restaurantId,
      customerName: name,
      customerEmail: email,
      customerPhone: reservationPhone.trim() || undefined,
      partySize,
      reservationTime: reservationIso,
      mealSlot: selectedOffer.mealSlot || activeMealSlot || 'lunch',
      note: reservationNote.trim() || undefined
    });
  };

  const renderAppReservationForm = (dateKeyPrefix = 'reservation') => (
    <View style={styles.orderForm}>
      <TextInput
        placeholder="Dein Name"
        value={reservationName}
        onChangeText={setReservationName}
        returnKeyType="done"
        blurOnSubmit
        onSubmitEditing={() => Keyboard.dismiss()}
        style={styles.orderInput}
      />
      <TextInput
        placeholder="E-Mail"
        value={reservationEmail}
        onChangeText={setReservationEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="done"
        blurOnSubmit
        onSubmitEditing={() => Keyboard.dismiss()}
        style={styles.orderInput}
      />
      <TextInput
        placeholder="Telefon (optional)"
        value={reservationPhone}
        onChangeText={setReservationPhone}
        keyboardType="phone-pad"
        returnKeyType="done"
        blurOnSubmit
        onSubmitEditing={() => Keyboard.dismiss()}
        style={styles.orderInput}
      />
      <View style={styles.orderRow}>
        <TextInput
          placeholder="Personen"
          value={reservationPartySize}
          onChangeText={setReservationPartySize}
          keyboardType="number-pad"
          returnKeyType="done"
          blurOnSubmit
          onSubmitEditing={() => Keyboard.dismiss()}
          style={[styles.orderInput, styles.orderInputSmall]}
        />
      </View>
      <Text style={styles.timePickerLabel}>Datum wählen</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.timeScroll}
        contentContainerStyle={styles.timeScrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {reservationDateOptions.map((option) => (
          <Pressable
            key={`${dateKeyPrefix}-${option.key}`}
            onPress={() => {
              if (!option.disabled) {
                setReservationDate(option.key);
              }
            }}
            style={[
              styles.timeChip,
              reservationDate === option.key && styles.timeChipActive,
              option.disabled && styles.timeChipDisabled
            ]}
            disabled={option.disabled}
          >
            <Text
              style={[
                styles.timeChipText,
                reservationDate === option.key && styles.timeChipTextActive,
                option.disabled && styles.timeChipTextDisabled
              ]}
            >
              {option.disabled ? `${option.label} geschlossen` : option.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      {selectedReservationClosure ? (
        <Text style={styles.orderError}>
          Geschlossen an diesem Tag: {selectedReservationClosure.reason}
        </Text>
      ) : null}
      <Text style={styles.timePickerLabel}>Uhrzeit wählen</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.timeScroll}
        contentContainerStyle={styles.timeScrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {orderTimeOptions.map((time) => (
          <Pressable
            key={`${dateKeyPrefix}-time-${time}`}
            onPress={() => setReservationTime(time)}
            style={[styles.timeChip, reservationTime === time && styles.timeChipActive]}
          >
            <Text
              style={[
                styles.timeChipText,
                reservationTime === time && styles.timeChipTextActive
              ]}
            >
              {time}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <TextInput
        placeholder="Notiz (optional)"
        value={reservationNote}
        onChangeText={setReservationNote}
        style={[styles.orderInput, styles.textArea]}
        multiline
      />
      <Pressable style={styles.preorderButton} onPress={handleSendReservation}>
        <Ionicons name="calendar" size={18} color={colors.white} />
        <Text style={styles.preorderText}>Reservierungsanfrage senden</Text>
      </Pressable>
      {reservationLocalError ? (
        <Text style={styles.orderError}>{reservationLocalError}</Text>
      ) : null}
      {reservationError ? <Text style={styles.orderError}>{reservationError}</Text> : null}
      {reservationStatus ? <Text style={styles.orderSuccess}>{reservationStatus}</Text> : null}
    </View>
  );

  const renderExternalReservationActions = () => (
    <View style={styles.actionPanelWrap}>
      <Text style={styles.actionPanelTitle}>Tisch reservieren</Text>
      <Text style={styles.reservationExternalHint}>
        Dieses Restaurant nutzt einen externen Reservierungsweg. Wähle direkt deinen gewünschten Kontakt.
      </Text>
      <View style={styles.reservationExternalActionList}>
        {selectedReservationExternalLink ? (
          <Pressable
            style={styles.reservationExternalActionButton}
            onPress={() => handleOpenExternalLink(selectedReservationExternalLink)}
          >
            <Ionicons name="globe-outline" size={18} color={colors.white} />
            <Text style={styles.reservationExternalActionText}>Reservierungsportal öffnen</Text>
          </Pressable>
        ) : null}
        {selectedReservationExternalEmail ? (
          <Pressable
            style={styles.reservationExternalActionButton}
            onPress={() => handleOpenExternalLink(`mailto:${selectedReservationExternalEmail}`)}
          >
            <Ionicons name="mail-outline" size={18} color={colors.white} />
            <Text style={styles.reservationExternalActionText}>E-Mail senden</Text>
          </Pressable>
        ) : null}
        {selectedReservationExternalPhone ? (
          <Pressable
            style={styles.reservationExternalActionButton}
            onPress={() => handleOpenExternalLink(`tel:${selectedReservationExternalPhone}`)}
          >
            <Ionicons name="call-outline" size={18} color={colors.white} />
            <Text style={styles.reservationExternalActionText}>Anrufen</Text>
          </Pressable>
        ) : null}
      </View>
      {!hasExternalReservationAction ? (
        <Text style={styles.orderError}>Für diesen externen Reservierungsweg fehlen aktuell Kontaktdaten.</Text>
      ) : null}
    </View>
  );

  const buildPickupIso = () => {
    const trimmed = orderTime.trim();
    const match = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    const now = new Date();
    const date = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      hours,
      minutes,
      0,
      0
    );
    return date.toISOString();
  };

  const handlePlaceOrder = async () => {
    if (!selectedOffer) return;
    const selectedOfferId = selectedOffer.offerId || selectedOffer.id;
    if (!selectedOfferId || selectedOffer.isRestaurantOnly) {
      setOrderLocalError('Für dieses Restaurant gibt es aktuell kein vorbestellbares Angebot.');
      return;
    }
    const name = orderName.trim();
    const email = orderEmail.trim().toLowerCase();
    const qty = Number(orderQty);
    const pickupIso = buildPickupIso();

    if (!name || !emailPattern.test(email) || !Number.isFinite(qty) || qty <= 0 || !pickupIso) {
      setOrderLocalError('Bitte Name, gültige E-Mail, Menge und Uhrzeit eingeben (z. B. 12:15).');
      return;
    }

    setOrderLocalError('');
    await placeOrder({
      offerId: selectedOfferId,
      customerName: name,
      customerEmail: email,
      quantity: qty,
      pickupTime: pickupIso,
      fulfillmentType: orderType
    });
  };

  const renderOffer = ({ item }) => {
    if (item?.itemType === 'section') {
      return (
        <View>
          <View
            style={[
              styles.listSectionHeader,
              item.tone === 'offers' ? styles.listSectionHeaderOffers : styles.listSectionHeaderMenu
            ]}
          >
            <View
              style={[
                styles.listSectionIconWrap,
                item.tone === 'offers' ? styles.listSectionIconWrapOffers : styles.listSectionIconWrapMenu
              ]}
            >
              <Ionicons
                name={item.icon || 'apps-outline'}
                size={15}
                color={item.tone === 'offers' ? colors.white : colors.ink}
              />
            </View>
            <Text
              style={[
                styles.listSectionTitle,
                item.tone === 'offers' ? styles.listSectionTitleOffers : styles.listSectionTitleMenu
              ]}
            >
              {item.title}
            </Text>
          </View>
          {item.showLunchFilters ? (
            <View style={styles.lunchNearbyFilterRow}>
              {[
                { key: 'all', label: 'Alle' },
                { key: 'offers', label: 'Angebote', count: filteredOfferCount },
                { key: 'lunch', label: 'Mittagstisch' },
                { key: 'vegan', label: 'Vegan' },
                { key: 'vegetarian', label: 'Vegetarisch' },
                { key: 'cafe', label: 'Café' },
                ...(previewEmbedded ? [{ key: 'breakfast', label: 'Frühstück' }] : [])
              ].map((filter) => {
                const isOffersFilter = filter.key === 'offers';
                const isBreakfastFilter = filter.key === 'breakfast';
                const active = isBreakfastFilter
                  ? activeMealSlot === 'breakfast'
                  : !isOffersFilter && lunchNearbyFilter === filter.key;
                return (
                  <Pressable
                    key={filter.key}
                    onPress={() => {
                      if (isOffersFilter) {
                        Keyboard.dismiss();
                        setOffersDietFilter('all');
                        setOffersPageOpen(true);
                        return;
                      }
                      if (isBreakfastFilter) {
                        setActiveMealSlot('breakfast');
                        setLunchNearbyFilter('all');
                        return;
                      }
                      if (filter.key === 'lunch') setActiveMealSlot('lunch');
                      setLunchNearbyFilter(filter.key);
                    }}
                    style={[styles.lunchNearbyFilterChip, active && styles.lunchNearbyFilterChipActive]}
                  >
                    <View style={styles.lunchNearbyFilterChipContent}>
                      <Text style={[styles.lunchNearbyFilterText, active && styles.lunchNearbyFilterTextActive]}>
                        {filter.label}
                      </Text>
                      {isOffersFilter ? (
                        <View style={styles.offersFilterBadge}>
                          <Text style={styles.offersFilterBadgeText}>{filter.count}</Text>
                        </View>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>
      );
    }

    const isLunchRestaurant = item?.itemType === 'lunchRestaurant';
    const saveType = item?.isRestaurantOnly || isLunchRestaurant ? 'restaurant' : 'offer';
    const saveTargetId = saveType === 'restaurant' ? item?.restaurantId : item?.offerId || item?.id;
    const saveItem = { type: saveType, targetId: String(saveTargetId || '') };
    const saved = Boolean(saveTargetId && savedItemKeys?.has?.(`${saveType}:${saveTargetId}`));
    return (
      <Pressable
        onPress={() => (isLunchRestaurant ? handleOpenLunchRestaurant(item) : handleOpenOffer(item))}
        style={({ pressed }) => [styles.offerPressable, pressed && styles.offerPressed]}
      >
        <OfferCard
          offer={item}
          distanceKm={item.distanceKm}
          ratingStars={item.restaurantRatingAverage || 0}
          ratingCount={item.restaurantRatingCount || 0}
          onPressView={() => handleOpenOffer(item)}
          onPressShare={item?.offerId ? () => handleShareOffer(item) : undefined}
          onPressMap={() => handleShowRestaurantOnMap(item)}
          saved={saved}
          onToggleSaved={onToggleSavedItem && saveTargetId ? () => onToggleSavedItem(saveItem) : undefined}
          onPressRestaurant={() =>
            isLunchRestaurant ? handleOpenLunchRestaurant(item) : handleOpenRestaurantInfoFromList(item)
          }
        />
      </Pressable>
    );
  };

  const renderListSeparator = () => <View style={{ height: spacing.md }} />;

  const renderEvent = ({ item }) => {
    const favorite = isFollowingEventProvider(item);
    const saved = Boolean(item?.id && savedItemKeys?.has?.(`event:${item.id}`));
    return (
      <EventCard
        event={item}
        favorite={favorite}
        saved={saved}
        onPress={() => handleOpenEvent(item)}
        onToggleFavorite={() => handleEventFavoritePress(item)}
        onToggleSaved={onToggleSavedItem ? () => onToggleSavedItem({ type: 'event', targetId: item.id }) : undefined}
        onPressImage={(imageUrl) => setEventImagePreviewUrl(imageUrl)}
        onShare={() => handleShareEvent(item)}
      />
    );
  };

  const renderCateringProvider = ({ item }) => (
    <Pressable
      style={({ pressed }) => [styles.cateringProviderCard, pressed && styles.cateringProviderCardPressed]}
      onPress={() => setSelectedCateringProvider(item)}
    >
      {item.logoUrl ? (
        <Image source={{ uri: item.logoUrl }} style={styles.cateringProviderLogo} resizeMode="cover" />
      ) : (
        <View style={styles.cateringProviderLogoFallback}>
          <Ionicons name="briefcase-outline" size={25} color={colors.accent} />
        </View>
      )}
      <View style={styles.cateringProviderContent}>
        <View style={styles.cateringProviderTitleRow}>
          <Text style={styles.cateringProviderName} numberOfLines={1}>{item.name || 'Catering'}</Text>
          <Ionicons name="chevron-forward" size={19} color={colors.muted} />
        </View>
        <Text style={styles.cateringProviderDescription} numberOfLines={2}>
          {item.cateringProfile?.offeringsText || 'Catering-Angebot'}
        </Text>
        <View style={styles.cateringProviderMetaRow}>
          <Ionicons name="location-outline" size={14} color={colors.accent} />
          <Text style={styles.cateringProviderMeta} numberOfLines={1}>
            {[item.address, item.postalCode, item.distanceKm !== null ? `${item.distanceKm.toFixed(1)} km` : '']
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
      </View>
    </Pressable>
  );

  const renderOffersPageHeader = () => (
    <View style={[styles.offersPageHeader, { paddingTop: Math.max(insets.top + spacing.sm, spacing.lg) }]}>
      <View style={styles.offersPageTitleRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Zurück zur Hauptseite"
          onPress={() => {
            setOffersPageOpen(false);
            setOffersDietFilter('all');
            setLunchNearbyFilter('all');
          }}
          style={({ pressed }) => [styles.offersPageBackButton, pressed && styles.offersPageBackButtonPressed]}
        >
          <Ionicons name="arrow-back" size={21} color={colors.ink} />
        </Pressable>
        <View style={styles.offersPageTitleCopy}>
          <Text style={styles.offersPageTitle}>Angebote</Text>
          <Text style={styles.offersPageSubtitle} numberOfLines={1}>
            {activePostal ? `${activePostal} · ${selectedMealLabel}` : selectedMealLabel}
          </Text>
        </View>
        <View style={styles.offersPageCountBadge}>
          <Text style={styles.offersPageCountText}>{filteredOfferCount}</Text>
        </View>
      </View>
      <View style={styles.offersPageFilterRow}>
        {[
          { key: 'all', label: 'Alle' },
          { key: 'vegan', label: 'Vegan' },
          { key: 'vegetarian', label: 'Vegetarisch' }
        ].map((filter) => {
          const active = offersDietFilter === filter.key;
          return (
            <Pressable
              key={filter.key}
              onPress={() => setOffersDietFilter(filter.key)}
              style={[styles.offersPageFilterChip, active && styles.offersPageFilterChipActive]}
            >
              <Text style={[styles.offersPageFilterText, active && styles.offersPageFilterTextActive]}>
                {filter.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  const renderEventsHeader = () => (
    <View style={[styles.eventsHeader, previewEmbedded && styles.previewEventsHeader]}>
      {previewEmbedded ? (
        <View style={styles.previewCompactBrand}>
          <Image source={appIcon} style={styles.previewCompactBrandIcon} resizeMode="cover" />
          <View style={styles.previewCompactBrandCopy}>
            <Text style={styles.previewCompactBrandTitle}>Events in deiner Nähe</Text>
            {hasValidEventLocation ? <Text style={styles.previewCompactBrandSubtitle}>{sortedEvents.length} Events</Text> : null}
          </View>
        </View>
      ) : (
        <View
          style={[
            styles.eventsHero,
            { paddingTop: Math.max(insets.top + spacing.xs, spacing.md) }
          ]}
        >
          <LinearGradient
            colors={['#7258D8', '#3A78C8']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.eventsHeroOverlay}
          />
          <View style={styles.eventsBrandRow}>
            <View style={styles.eventsBrand}>
              <Image source={appIcon} style={styles.eventsBrandLogo} resizeMode="cover" />
              <View style={styles.eventsBrandCopy}>
                <Text style={styles.eventsTitle} numberOfLines={1}>Events</Text>
                <Text style={styles.eventsSubtitle} numberOfLines={1}>Events in deiner Nähe</Text>
              </View>
            </View>
            <View style={styles.eventsCountPill}>
              <Ionicons name="sparkles-outline" size={15} color={colors.white} />
              <Text style={styles.eventsCountText}>{hasValidEventLocation ? sortedEvents.length : 0}</Text>
            </View>
          </View>
        </View>
      )}
        <View style={[styles.eventsFilterCardWrap, previewEmbedded && styles.previewEventsFilterCardWrap]}>
        <View style={[styles.eventsFilterCard, previewEmbedded && styles.previewEventsFilterCard]}>
          <View style={styles.eventsSearchRow}>
            <View style={styles.eventsLocationInputWrap}>
              <Ionicons name="location-outline" size={17} color={colors.accent} />
              <TextInput
                value={eventLocationQuery}
                onChangeText={setEventLocationQuery}
                placeholder="Ort: PLZ oder Stadt"
                autoCapitalize="words"
                returnKeyType="search"
                blurOnSubmit
                onSubmitEditing={submitEventLocationSearch}
                style={styles.eventsLocationInput}
              />
              {eventLocationQuery ? (
                <Pressable
                  style={styles.eventsLocationClearButton}
                  hitSlop={8}
                  onPress={clearEventLocationSearch}
                  accessibilityRole="button"
                  accessibilityLabel="Event-Ort löschen"
                >
                  <Ionicons name="close-circle" size={20} color={colors.danger || '#DC2626'} />
                </Pressable>
              ) : null}
            </View>
            <Pressable
              style={({ pressed }) => [
                styles.eventsSearchButton,
                eventLocationQuery.trim().length < 2 && styles.eventsSearchButtonDisabled,
                pressed && eventLocationQuery.trim().length >= 2 && styles.eventsSearchButtonPressed
              ]}
              onPress={submitEventLocationSearch}
              disabled={eventLocationQuery.trim().length < 2}
              accessibilityRole="button"
              accessibilityLabel="Events suchen"
            >
              <Ionicons name="search" size={17} color={colors.white} />
              <Text style={styles.eventsSearchButtonText}>Suchen</Text>
            </Pressable>
          </View>
          <View style={styles.eventsRadiusRow}>
            {eventRadiusOptions.map((radiusKm) => {
              const active = eventRadiusKm === radiusKm;
              return (
                <Pressable
                  key={`event-radius-${radiusKm}`}
                  onPress={() => setEventRadiusKm(radiusKm)}
                  style={[styles.eventsRadiusChip, active && styles.eventsRadiusChipActive]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`${radiusKm} Kilometer Umkreis`}
                >
                  <Text style={[styles.eventsRadiusChipText, active && styles.eventsRadiusChipTextActive]}>
                    {radiusKm} km
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.eventsSearchStatus} accessibilityLiveRegion="polite">
            {eventSearchStatus}
          </Text>
        <View style={styles.eventsCompactFilterRow}>
          <View style={styles.eventsCompactFilterButton}>
            <Pressable style={styles.eventsCompactFilterMain} onPress={openEventDateFilterPicker}>
              <Ionicons name="calendar-outline" size={17} color={colors.accent} />
              <View style={styles.eventsCompactFilterTextWrap}>
                <Text style={styles.eventsCompactFilterLabel}>Wann</Text>
                <Text style={styles.eventsCompactFilterValue} numberOfLines={1}>
                  {formatEventDateFilterLabel(eventDateFilter)}
                </Text>
              </View>
            </Pressable>
            {eventDateFilter ? (
              <Pressable
                style={styles.eventsCompactClearButton}
                hitSlop={6}
                onPress={() => setEventDateFilter('')}
                accessibilityRole="button"
                accessibilityLabel="Event-Datum löschen"
              >
                <Ionicons name="close" size={16} color={colors.danger || '#DC2626'} />
              </Pressable>
            ) : null}
          </View>
          <Pressable
            style={styles.eventsCompactFilterButton}
            disabled={Boolean(lockedEventTagKey)}
            onPress={() => {
              Keyboard.dismiss();
              setEventFiltersOpen((open) => !open);
            }}
          >
            <View style={styles.eventsCompactFilterMain}>
              <Ionicons name="options-outline" size={17} color={colors.accent} />
              <View style={styles.eventsCompactFilterTextWrap}>
                <Text style={styles.eventsCompactFilterLabel}>Art Event</Text>
                <Text style={styles.eventsCompactFilterValue} numberOfLines={1}>
                  {lockedEventTagKey ? 'Kategorie festgelegt' : eventTagFilters.length ? `${eventTagFilters.length} aktiv` : 'Alle Arten'}
                </Text>
              </View>
              <Ionicons
                name={eventFiltersOpen ? 'chevron-up' : 'chevron-down'}
                size={17}
                color={colors.ink}
                style={styles.eventsCompactFilterChevron}
              />
            </View>
          </Pressable>
        </View>
          {eventFiltersOpen && !lockedEventTagKey ? (
            <View style={styles.eventsTagFilterRow}>
            {eventTagOptions.map((option) => {
              const active = eventTagFilters.includes(option.key);
              return (
                <Pressable
                  key={option.key}
                  onPress={() => toggleEventTagFilter(option.key)}
                  style={[styles.eventsTagFilterChip, active && styles.eventsTagFilterChipActive]}
                >
                  <Ionicons
                    name={option.icon}
                    size={13}
                    color={active ? colors.white : colors.ink}
                  />
                  <Text
                    style={[
                      styles.eventsTagFilterText,
                      active && styles.eventsTagFilterTextActive
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
            {eventTagFilters.length && !lockedEventTagKey ? (
              <Pressable style={styles.eventsTagClearChip} onPress={() => setEventTagFilters([])}>
                <Text style={styles.eventsTagClearText}>Alle Filter löschen</Text>
              </Pressable>
            ) : null}
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );

  const handleOpenRestaurant = () => {
    setMenuOpen(false);
    if (typeof onOpenRestaurant === 'function') {
      onOpenRestaurant();
    }
  };

  const handleOpenExternalLink = async (url) => {
    if (!url) return;
    setMenuOpen(false);
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) return;
      await Linking.openURL(url);
    } catch {
      // ignore link-open errors
    }
  };

  return (
    <View style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.screen}
      >
        {offersPageOpen && isFoodTab ? (
          <FlatList
            data={filteredOfferItems}
            keyExtractor={(item, index) => String(item?.offerId || item?.id || `offer-${index}`)}
            renderItem={renderOffer}
            style={styles.offerList}
            contentContainerStyle={[styles.offersPageListContent, { paddingBottom: 88 + insets.bottom }]}
            showsVerticalScrollIndicator={false}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            onScrollBeginDrag={Keyboard.dismiss}
            ListHeaderComponent={renderOffersPageHeader()}
            ItemSeparatorComponent={renderListSeparator}
            ListEmptyComponent={
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>Keine Angebote</Text>
                <Text style={styles.emptyText}>
                  Für diese Auswahl gibt es aktuell keine Angebote.
                </Text>
              </View>
            }
          />
        ) : isFoodTab || (isCateringTab && cateringEnabled) ? (
          <FlatList
            data={isCateringTab ? cateringProviders : foodListItems}
            keyExtractor={(item, index) => String(item?.id || `${item?.itemType || 'item'}-${index}`)}
            renderItem={isCateringTab ? renderCateringProvider : renderOffer}
            style={styles.offerList}
            contentContainerStyle={[styles.listContent, { paddingBottom: 88 + insets.bottom }]}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              <View style={[styles.heroWrap, previewEmbedded && styles.previewHeroWrap]}>
                <View style={styles.heroPanel}>
                  {!previewEmbedded ? (
                    <View
                      style={[
                        styles.heroBackdrop,
                        { paddingTop: Math.max(insets.top + spacing.xs, spacing.md) }
                      ]}
                    >
                      <LinearGradient
                        colors={['#8AB9FF', '#77ABFF', '#6D9EFF']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.heroOverlay}
                      />
                      <View style={styles.heroBrandRow}>
                        <View style={styles.heroBrand}>
                          <Image source={appIcon} style={styles.heroBrandLogo} resizeMode="cover" />
                          <View style={styles.heroBrandCopy}>
                            <Text style={styles.heroHeading} numberOfLines={1}>Nah&Fein</Text>
                            <Text style={styles.heroSubheading} numberOfLines={1}>
                              {isCateringTab ? 'Catering in deiner Nähe' : 'Essen in deiner Nähe'}
                            </Text>
                          </View>
                        </View>
                        <Pressable
                          onPress={() => {
                            if (authToken) {
                              handleOpenRestaurant();
                              return;
                            }
                            setMenuOpen(true);
                          }}
                          style={({ pressed }) => [
                            styles.menuButton,
                            pressed && styles.menuButtonPressed
                          ]}
                        >
                          <Ionicons name="storefront-outline" size={15} color={colors.white} />
                          <Text style={styles.menuButtonText}>{authToken ? 'Dein Dashboard' : 'Als Partner'}</Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : null}
                  <View style={[styles.heroControlsWrap, previewEmbedded && styles.previewHeroControlsWrap]}>
                    <View style={[styles.heroControls, previewEmbedded && styles.previewHeroControls]}>
                      {!previewEmbedded && !isCateringTab ? (
                        <View style={styles.mealSwitcher}>
                          {availableMealSlotOptions.map((option) => {
                            const active = activeMealSlot === option.key;
                            return (
                              <Pressable
                                key={option.key}
                                onPress={() => {
                                  setOffersPageOpen(false);
                                  setOffersDietFilter('all');
                                  setActiveMealSlot(option.key);
                                }}
                                style={[
                                  styles.mealSwitcherButton,
                                  active && styles.mealSwitcherButtonActive
                                ]}
                              >
                                <Ionicons
                                  name={option.icon}
                                  size={14}
                                  color={active ? colors.accent : colors.muted}
                                />
                                <Text
                                  style={[
                                    styles.mealSwitcherText,
                                    active && styles.mealSwitcherTextActive
                                  ]}
                                >
                                  {option.label}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      ) : null}

                      <View style={styles.inputRow}>
                        <View style={styles.inputWrap}>
                          <Ionicons name="location" size={18} color={colors.muted} />
                          <TextInput
                            placeholder="Stadt oder PLZ"
                            value={query}
                            onChangeText={setQuery}
                            style={styles.input}
                            returnKeyType="search"
                            onSubmitEditing={handleSearch}
                          />
                        </View>
                        {previewEmbedded ? (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Restaurants auf Karte anzeigen"
                            onPress={() => {
                              setMapFocusRestaurantKey('');
                              setActiveFooterTab('map');
                            }}
                            style={styles.previewMapSearchButton}
                          >
                            <Ionicons name="map-outline" size={15} color={colors.ink} />
                            <Text style={styles.previewMapSearchText}>Karte</Text>
                          </Pressable>
                        ) : null}
                        <Pressable
                          style={({ pressed }) => [styles.button, pressed && styles.searchButtonPressed]}
                          onPress={handleSearch}
                        >
                          <Ionicons name="search" size={15} color={colors.ink} />
                          <Text style={styles.buttonText}>Suchen</Text>
                        </Pressable>
                      </View>

                      {!isCateringTab ? (
                        <View style={[styles.eventsRadiusRow, styles.restaurantRadiusRow]}>
                          {restaurantRadiusOptions.map((radiusKm) => {
                            const active = restaurantRadiusKm === radiusKm;
                            return (
                              <Pressable
                                key={`restaurant-radius-${radiusKm}`}
                                onPress={() => setRestaurantRadiusKm(radiusKm)}
                                style={[styles.eventsRadiusChip, active && styles.eventsRadiusChipActive]}
                                accessibilityRole="button"
                                accessibilityState={{ selected: active }}
                                accessibilityLabel={`${radiusKm} Kilometer Umkreis für Restaurants`}
                              >
                                <Text style={[styles.eventsRadiusChipText, active && styles.eventsRadiusChipTextActive]}>
                                  {radiusKm} km
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      ) : null}

                      <View style={styles.filterRow}>
                        <Pressable
                          onPress={() => setFilterOpen(true)}
                          style={[
                            styles.filterOpenButton,
                            hasAdvancedFilters && styles.filterOpenButtonActive
                          ]}
                        >
                          <Ionicons
                            name="options-outline"
                            size={14}
                            color={hasAdvancedFilters ? colors.white : colors.ink}
                          />
                          <Text
                            style={[
                              styles.filterOpenText,
                              hasAdvancedFilters && styles.filterOpenTextActive
                            ]}
                          >
                            Filter
                          </Text>
                        </Pressable>
                        {activePostal ? (
                          <Text
                            style={[styles.status, showRestaurantCount && styles.statusRestaurantCount]}
                            numberOfLines={1}
                            ellipsizeMode="tail"
                          >
                            {showRestaurantCount
                              ? `${filteredRestaurantCount} ${filteredRestaurantCount === 1 ? 'Restaurant' : 'Restaurants'}`
                              : statusText()}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  </View>
                </View>
              </View>
            }
            ListEmptyComponent={
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>{isCateringTab ? 'Kein Catering gefunden' : 'Keine Angebote'}</Text>
                <Text style={styles.emptyText}>
                  {isCateringTab
                    ? cateringLoading
                      ? 'Catering-Anbieter werden geladen...'
                      : cateringError || 'Für deine Suche ist aktuell kein Catering-Anbieter sichtbar.'
                    : 'Noch keine Angebote gefunden. Als Partner registrieren und ein Angebot anlegen.'}
                </Text>
              </View>
            }
            ItemSeparatorComponent={renderListSeparator}
          />
        ) : activeFooterTab === 'map' ? (
          <View
            style={[
              styles.mapTabWrap,
              mapPoints.length ? styles.iosMapTabWrap : null,
              { paddingBottom: 88 + insets.bottom }
            ]}
          >
            {previewEmbedded ? (
              <Pressable style={styles.previewMapListButton} onPress={() => setActiveFooterTab('food')}>
                <Ionicons name="list-outline" size={16} color={colors.ink} />
                <Text style={styles.previewMapListText}>Zur Liste</Text>
              </Pressable>
            ) : null}
            <View style={[styles.mapCard, mapPoints.length ? styles.iosMapCard : null]}>
              {mapPoints.length ? (
                <View style={styles.iosMapHeaderOverlay} pointerEvents="none">
                  <Text style={styles.mapTitle}>Restaurants auf Karte</Text>
                  <Text style={styles.mapCount}>{mapPoints.length}</Text>
                </View>
              ) : (
                <View style={styles.mapHeaderRow}>
                  <Text style={styles.mapTitle}>Restaurants auf Karte</Text>
                  <Text style={styles.mapCount}>{mapPoints.length}</Text>
                </View>
              )}
              {mapPoints.length ? (
                <>
                  <RestaurantMap
                    points={mapPoints}
                    regionKey={mapRegionKey}
                    focusPointKey={mapFocusRestaurantKey}
                    initialRegion={mapRegion}
                    fullScreen
                    onSelectPoint={(point) => handleOpenRestaurantInfoFromList(point?.sourceOffer)}
                  />
                  <View style={styles.iosMapHintOverlay} pointerEvents="none">
                    <Text style={styles.iosMapHintText}>Marker antippen für Restaurant-Infos und Menü</Text>
                  </View>
                </>
              ) : (
                <View style={styles.mapEmptyState}>
                  <Ionicons name="map-outline" size={30} color={colors.accent} />
                  <Text style={styles.mapEmptyTitle}>Keine Restaurants auf der Karte</Text>
                <Text style={styles.mapEmptyText}>
                    Suche zuerst mit Stadt oder Postleitzahl, dann erscheinen die Restaurant-Punkte hier.
                  </Text>
                </View>
              )}
            </View>
          </View>
        ) : eventsEnabled ? (
          <FlatList
            data={hasValidEventLocation ? sortedEvents : []}
            keyExtractor={(item, index) => String(item?.id || `event-${index}`)}
            renderItem={renderEvent}
            style={styles.offerList}
            contentContainerStyle={[styles.eventsListContent, { paddingBottom: 88 + insets.bottom }]}
            showsVerticalScrollIndicator={false}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            onScrollBeginDrag={Keyboard.dismiss}
            ListHeaderComponent={renderEventsHeader()}
            ItemSeparatorComponent={renderListSeparator}
            ListEmptyComponent={
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>Keine Events</Text>
                <Text style={styles.emptyText}>
                  {!hasValidEventLocation
                    ? 'Bitte PLZ oder Stadt eingeben.'
                    : eventsLoading
                    ? 'Events werden geladen...'
                    : eventsError || 'Für deine Suche sind aktuell keine kommenden Events sichtbar.'}
                </Text>
              </View>
            }
          />
        ) : (
          <View style={[styles.cateringPlaceholderWrap, { paddingBottom: 88 + insets.bottom }]}>
            <View style={styles.cateringPlaceholderCard}>
              <Ionicons name="people-circle-outline" size={34} color={colors.accent} />
              <Text style={styles.cateringPlaceholderTitle}>Events</Text>
              <Text style={styles.cateringPlaceholderText}>
                Dieser Bereich bleibt erstmal leer und kommt später.
              </Text>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>

      <Modal
        visible={!!selectedCateringProvider}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedCateringProvider(null)}
      >
        <View style={styles.cateringModalWrap}>
          <Pressable style={styles.cateringModalBackdrop} onPress={() => setSelectedCateringProvider(null)} />
          <View style={styles.cateringModalCard}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.cateringModalContent}>
              <View style={styles.cateringModalHeader}>
                {selectedCateringProvider?.logoUrl ? (
                  <Image source={{ uri: selectedCateringProvider.logoUrl }} style={styles.cateringModalLogo} />
                ) : (
                  <View style={styles.cateringModalLogoFallback}>
                    <Ionicons name="briefcase-outline" size={25} color={colors.accent} />
                  </View>
                )}
                <Pressable onPress={() => setSelectedCateringProvider(null)} style={styles.cateringModalClose}>
                  <Ionicons name="close" size={20} color={colors.ink} />
                </Pressable>
              </View>
              <Text style={styles.cateringModalTitle}>{selectedCateringProvider?.name || 'Catering'}</Text>
              <Text style={styles.cateringModalLabel}>Was wir anbieten</Text>
              <Text style={styles.cateringModalDescription}>
                {selectedCateringProvider?.cateringProfile?.offeringsText || ''}
              </Text>
              {selectedCateringProvider?.cateringOffers?.length ? (
                <View style={styles.cateringPackagesSection}>
                  <Text style={styles.cateringModalLabel}>Catering-Angebote</Text>
                  {selectedCateringProvider.cateringOffers.map((offer) => (
                    <View key={offer.id} style={styles.cateringPackageCard}>
                      <View style={styles.cateringPackageHeader}>
                        <Text style={styles.cateringPackageTitle}>{offer.title}</Text>
                        {offer.price !== null ? (
                          <Text style={styles.cateringPackagePrice}>{formatPrice(offer.price)}</Text>
                        ) : null}
                      </View>
                      <Text style={styles.cateringPackageDescription}>{offer.description}</Text>
                      {offer.imageUrls?.length ? (
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={styles.cateringPackageImageRow}
                        >
                          {offer.imageUrls.map((imageUrl, index) => (
                            <Image
                              key={`${offer.id}-image-${index}`}
                              source={{ uri: imageUrl }}
                              style={styles.cateringPackageImage}
                            />
                          ))}
                        </ScrollView>
                      ) : null}
                    </View>
                  ))}
                </View>
              ) : null}
              <View style={styles.cateringModalAddress}>
                <Ionicons name="location-outline" size={18} color={colors.accent} />
                <Text style={styles.cateringModalAddressText}>
                  {[selectedCateringProvider?.address, selectedCateringProvider?.postalCode].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <View style={styles.cateringModalActions}>
                {selectedCateringProvider?.cateringProfile?.contactPhone || selectedCateringProvider?.phone ? (
                  <Pressable
                    style={styles.cateringModalPrimaryAction}
                    onPress={() =>
                      handleOpenExternalLink(`tel:${selectedCateringProvider.cateringProfile?.contactPhone || selectedCateringProvider.phone}`)
                    }
                  >
                    <Ionicons name="call-outline" size={17} color={colors.white} />
                    <Text style={styles.cateringModalPrimaryActionText}>Anrufen</Text>
                  </Pressable>
                ) : null}
                {selectedCateringProvider?.cateringProfile?.contactEmail ? (
                  <Pressable
                    style={styles.cateringModalSecondaryAction}
                    onPress={() => handleOpenExternalLink(`mailto:${selectedCateringProvider.cateringProfile.contactEmail}`)}
                  >
                    <Ionicons name="mail-outline" size={17} color={colors.ink} />
                    <Text style={styles.cateringModalSecondaryActionText}>E-Mail</Text>
                  </Pressable>
                ) : null}
                {selectedCateringProvider?.cateringProfile?.contactUrl ? (
                  <Pressable
                    style={styles.cateringModalSecondaryAction}
                    onPress={() => handleOpenExternalLink(selectedCateringProvider.cateringProfile.contactUrl)}
                  >
                    <Ionicons name="globe-outline" size={17} color={colors.ink} />
                    <Text style={styles.cateringModalSecondaryActionText}>Website</Text>
                  </Pressable>
                ) : null}
              </View>
              {selectedCateringProvider?.socialLinks?.length ? (
                <View style={styles.cateringSocialSection}>
                  <Text style={styles.cateringModalLabel}>Social Media</Text>
                  <View style={styles.cateringSocialRow}>
                    {selectedCateringProvider.socialLinks.map((entry, index) => (
                      <Pressable
                        key={`${entry.platform}-${entry.url}-${index}`}
                        style={styles.cateringSocialButton}
                        onPress={() => handleOpenExternalLink(entry.url)}
                      >
                        <Ionicons name={eventSocialIcon(entry.platform)} size={16} color={colors.ink} />
                        <Text style={styles.cateringSocialText}>{entry.platform}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {!previewEmbedded ? (
        <View style={[styles.footerMiniNav, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        <Pressable
          onPress={() => setActiveFooterTab('food')}
          style={({ pressed }) => [
            styles.footerMiniButton,
            activeFooterTab === 'food' && styles.footerMiniButtonActive,
            pressed && styles.footerMiniPressed
          ]}
        >
          <Ionicons
            name={activeFooterTab === 'food' ? 'restaurant' : 'restaurant-outline'}
            size={16}
            color={activeFooterTab === 'food' ? colors.white : colors.ink}
          />
          <Text
            style={[
              styles.footerMiniLabel,
              activeFooterTab === 'food' && styles.footerMiniLabelActive
            ]}
          >
            Essen
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setActiveFooterTab('events')}
          style={({ pressed }) => [
            styles.footerMiniButton,
            activeFooterTab === 'events' && styles.footerMiniButtonActive,
            pressed && styles.footerMiniPressed
          ]}
        >
          <Ionicons
            name={activeFooterTab === 'events' ? 'calendar' : 'calendar-outline'}
            size={16}
            color={activeFooterTab === 'events' ? colors.white : colors.ink}
          />
          <Text
            style={[
              styles.footerMiniLabel,
              activeFooterTab === 'events' && styles.footerMiniLabelActive
            ]}
          >
            Events
          </Text>
        </Pressable>
        {cateringEnabled ? (
          <Pressable
            onPress={() => setActiveFooterTab('catering')}
            style={({ pressed }) => [
              styles.footerMiniButton,
              activeFooterTab === 'catering' && styles.footerMiniButtonActive,
              pressed && styles.footerMiniPressed
            ]}
          >
            <Ionicons
              name={activeFooterTab === 'catering' ? 'people' : 'people-outline'}
              size={16}
              color={activeFooterTab === 'catering' ? colors.white : colors.ink}
            />
            <Text
              style={[
                styles.footerMiniLabel,
                activeFooterTab === 'catering' && styles.footerMiniLabelActive
              ]}
            >
              Catering
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => {
            setMapFocusRestaurantKey('');
            setActiveFooterTab('map');
          }}
          style={({ pressed }) => [
            styles.footerMiniButton,
            activeFooterTab === 'map' && styles.footerMiniButtonActive,
            pressed && styles.footerMiniPressed
          ]}
        >
          <Ionicons
            name={activeFooterTab === 'map' ? 'map' : 'map-outline'}
            size={16}
            color={activeFooterTab === 'map' ? colors.white : colors.ink}
          />
          <Text style={[styles.footerMiniLabel, activeFooterTab === 'map' && styles.footerMiniLabelActive]}>
            Karte
          </Text>
        </Pressable>
        </View>
      ) : null}

      <Modal visible={menuOpen} transparent animationType="none" onRequestClose={() => setMenuOpen(false)}>
        <View style={styles.menuModalWrap}>
          <Pressable style={styles.menuBackdrop} onPress={() => setMenuOpen(false)}>
            <Animated.View style={[styles.menuBackdropFill, { opacity: menuOverlayOpacity }]} />
          </Pressable>

          <Animated.View style={[styles.sideMenuPanel, menuPanelStyle]}>
            <View style={styles.sideMenuHeader}>
              <View style={styles.sideMenuBrandRow}>
                <Image source={appIcon} style={styles.sideMenuBrandLogo} />
                <Text style={styles.sideMenuBrandText}>Nah&Fein</Text>
              </View>
              <Pressable onPress={() => setMenuOpen(false)} style={styles.sideMenuClose}>
                <Ionicons name="close" size={20} color={colors.ink} />
              </Pressable>
            </View>

            <Text style={styles.sideMenuHeading}>Soziale Medien</Text>
            <View style={styles.sideMenuSocialRow}>
              <Pressable
                onPress={() => handleOpenExternalLink(INSTAGRAM_URL)}
                style={({ pressed }) => [styles.sideMenuSocialChip, pressed && styles.sideMenuSocialChipPressed]}
              >
                <Ionicons name="logo-instagram" size={14} color={colors.ink} />
                <Text style={styles.sideMenuSocialText}>Instagram</Text>
              </Pressable>
            </View>

            <Text style={styles.sideMenuHeading}>Kontakt</Text>
            <View style={styles.sideMenuContactRow}>
              <Ionicons name="call-outline" size={15} color={colors.ink} />
              <Text style={styles.sideMenuText}>+49 177 1544169</Text>
            </View>
            <View style={styles.sideMenuContactRow}>
              <Ionicons name="mail-outline" size={15} color={colors.ink} />
              <Text style={styles.sideMenuText}>info@bundle.jetzt</Text>
            </View>
            <View style={styles.sideMenuContactRow}>
              <Ionicons name="location-outline" size={15} color={colors.ink} />
              <Text style={styles.sideMenuText}>Ravensburg</Text>
            </View>

            <View style={styles.sideMenuBottom}>
              <Pressable
                onPress={() => {
                  setMenuOpen(false);
                  handleOpenRestaurant?.();
                }}
                style={({ pressed }) => [
                  styles.sideMenuRegisterButton,
                  pressed && styles.sideMenuRegisterButtonPressed
                ]}
              >
                <Ionicons name="home-outline" size={16} color={colors.white} />
                <Text style={styles.sideMenuRegisterButtonText}>Als Partner registrieren</Text>
              </Pressable>
              <Pressable
                onPress={() => handleOpenExternalLink(IMPRESSUM_URL)}
                style={({ pressed }) => [
                  styles.sideMenuLegalLink,
                  pressed && styles.sideMenuLegalPressed
                ]}
              >
                <Ionicons name="document-text-outline" size={16} color={colors.ink} />
                <Text style={styles.sideMenuLegalText}>Impressum</Text>
              </Pressable>
              <Pressable
                onPress={() => handleOpenExternalLink(DATENSCHUTZ_URL)}
                style={({ pressed }) => [
                  styles.sideMenuLegalLink,
                  pressed && styles.sideMenuLegalPressed
                ]}
              >
                <Ionicons name="shield-checkmark-outline" size={16} color={colors.ink} />
                <Text style={styles.sideMenuLegalText}>Datenschutz</Text>
              </Pressable>
              <Pressable
                onPress={() => handleOpenExternalLink(AGB_URL)}
                style={({ pressed }) => [
                  styles.sideMenuLegalLink,
                  pressed && styles.sideMenuLegalPressed
                ]}
              >
                <Ionicons name="document-outline" size={16} color={colors.ink} />
                <Text style={styles.sideMenuLegalText}>AGB</Text>
              </Pressable>
            </View>
          </Animated.View>
        </View>
      </Modal>

      <Modal
        visible={filterOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setFilterOpen(false)}
      >
        <View style={styles.filterModalWrap}>
          <Pressable style={styles.filterModalBackdrop} onPress={() => setFilterOpen(false)} />

          <View style={styles.filterModalCard}>
            <Text style={styles.filterModalTitle}>Filter</Text>

            <View style={styles.filterOptionsRow}>
              <Pressable
                onPress={() => setSortMode((prev) => (prev === 'distanceAsc' ? 'none' : 'distanceAsc'))}
                style={[
                  styles.filterChoice,
                  sortMode === 'distanceAsc' && styles.filterChoiceActive
                ]}
              >
                <Text
                  style={[
                    styles.filterChoiceText,
                    sortMode === 'distanceAsc' && styles.filterChoiceTextActive
                  ]}
                >
                  Näher zuerst
                </Text>
              </Pressable>
            </View>

            <Pressable
              onPress={() => setPreorderOnly((prev) => !prev)}
              style={[styles.filterChoice, preorderOnly && styles.filterChoiceActive]}
            >
              <Text style={[styles.filterChoiceText, preorderOnly && styles.filterChoiceTextActive]}>
                Vorbestellung möglich
              </Text>
            </Pressable>

            <Text style={styles.filterModalLabel}>Öffnungszeiten</Text>
            <View style={styles.filterOpeningStatusRow}>
              {[
                { key: 'all', label: 'Alle' },
                { key: 'open', label: 'Jetzt geöffnet' },
                { key: 'closed', label: 'Jetzt geschlossen' }
              ].map((option) => {
                const active = openingStatusFilter === option.key;
                return (
                  <Pressable
                    key={option.key}
                    onPress={() => {
                      setOpeningStatusFilter(option.key);
                      if (option.key !== 'all') setOpeningDayFilter('');
                    }}
                    style={[styles.filterCuisineChip, active && styles.filterCuisineChipActive]}
                  >
                    <Text style={[styles.filterCuisineChipText, active && styles.filterCuisineChipTextActive]}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.filterOpeningHint}>Oder Restaurants auswählen, die an diesem Tag geöffnet haben:</Text>
            <View style={styles.filterCuisineWrap}>
              {openingHourDays.map((day) => {
                const active = openingDayFilter === day.key;
                return (
                  <Pressable
                    key={day.key}
                    onPress={() => {
                      setOpeningDayFilter((current) => (current === day.key ? '' : day.key));
                      setOpeningStatusFilter('all');
                    }}
                    style={[styles.filterCuisineChip, active && styles.filterCuisineChipActive]}
                  >
                    <Text style={[styles.filterCuisineChipText, active && styles.filterCuisineChipTextActive]}>
                      {day.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.filterModalLabel}>Art Restaurant</Text>
            <View style={styles.filterCuisineWrap}>
              {cuisineFilterOptions.map((cuisine) => {
                const active = selectedCuisineTypes.includes(cuisine);
                return (
                  <Pressable
                    key={cuisine}
                    onPress={() => toggleCuisineFilter(cuisine)}
                    style={[styles.filterCuisineChip, active && styles.filterCuisineChipActive]}
                  >
                    <Text style={[styles.filterCuisineChipText, active && styles.filterCuisineChipTextActive]}>
                      {cuisine}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.filterActionRow}>
              <Pressable
                onPress={() => {
                  setSortMode('none');
                  setPreorderOnly(false);
                  setSelectedCuisineTypes([]);
                  setOpeningStatusFilter('all');
                  setOpeningDayFilter('');
                }}
                style={styles.filterResetButton}
              >
                <Text style={styles.filterResetText}>Zurücksetzen</Text>
              </Pressable>
              <Pressable onPress={() => setFilterOpen(false)} style={styles.filterApplyButton}>
                <Text style={styles.filterApplyText}>Fertig</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={Platform.OS === 'ios' && eventDatePickerState.visible}
        transparent
        animationType="fade"
        onRequestClose={closeEventDateFilterPicker}
      >
        <View style={styles.eventDatePickerBackdrop}>
          <View style={styles.eventDatePickerModalCard}>
            <Text style={styles.eventDatePickerModalTitle}>Event-Datum wählen</Text>
            <DateTimePicker
              value={eventDatePickerState.value}
              mode="date"
              display="spinner"
              onChange={handleEventDateFilterChange}
              style={styles.eventDatePickerSpinner}
            />
            <View style={styles.eventDatePickerModalActions}>
              <Pressable style={styles.eventDatePickerOutlineAction} onPress={closeEventDateFilterPicker}>
                <Text style={styles.eventDatePickerOutlineActionText}>Abbrechen</Text>
              </Pressable>
              <Pressable style={styles.eventDatePickerPrimaryAction} onPress={confirmEventDateFilter}>
                <Text style={styles.eventDatePickerPrimaryActionText}>Fertig</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {Platform.OS === 'android' && eventDatePickerState.visible ? (
        <DateTimePicker
          value={eventDatePickerState.value}
          mode="date"
          display="default"
          onChange={handleEventDateFilterChange}
        />
      ) : null}

      <Modal
        visible={!!eventFollowConfirmation}
        transparent
        animationType="fade"
        onRequestClose={() => !eventFollowBusy && setEventFollowConfirmation(null)}
      >
        <View style={styles.eventFollowModalWrap}>
          <Pressable
            style={styles.eventFollowModalBackdrop}
            onPress={() => !eventFollowBusy && setEventFollowConfirmation(null)}
          />
          <View style={styles.eventFollowModalCard}>
            <View style={styles.eventFollowIconWrap}>
              <Ionicons name="star" size={24} color="#B77900" />
            </View>
            <Text style={styles.eventFollowTitle}>Veranstalter folgen?</Text>
            <Text style={styles.eventFollowText}>
              Du wirst über neue Events von {eventFollowConfirmation?.provider?.name || 'diesem Veranstalter'} benachrichtigt.
            </Text>
            <View style={styles.eventFollowActions}>
              <Pressable
                disabled={eventFollowBusy}
                onPress={() => setEventFollowConfirmation(null)}
                style={[styles.eventFollowSecondaryButton, eventFollowBusy && styles.eventFollowButtonDisabled]}
              >
                <Text style={styles.eventFollowSecondaryText}>Nicht jetzt</Text>
              </Pressable>
              <Pressable
                disabled={eventFollowBusy}
                onPress={confirmEventFollow}
                style={[styles.eventFollowPrimaryButton, eventFollowBusy && styles.eventFollowButtonDisabled]}
              >
                <Text style={styles.eventFollowPrimaryText}>{eventFollowBusy ? 'Wird eingerichtet ...' : 'Folgen'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={eventNotificationPermissionDenied}
        transparent
        animationType="fade"
        onRequestClose={() => setEventNotificationPermissionDenied(false)}
      >
        <View style={styles.eventFollowModalWrap}>
          <Pressable style={styles.eventFollowModalBackdrop} onPress={() => setEventNotificationPermissionDenied(false)} />
          <View style={styles.eventFollowModalCard}>
            <View style={styles.eventFollowIconWrap}>
              <Ionicons name="notifications-off-outline" size={24} color={colors.accentWarm} />
            </View>
            <Text style={styles.eventFollowTitle}>Benachrichtigungen nicht freigegeben</Text>
            <Text style={styles.eventFollowText}>
              Du kannst sie in den App-Einstellungen aktivieren und dem Veranstalter danach folgen.
            </Text>
            <View style={styles.eventFollowActions}>
              <Pressable
                onPress={() => setEventNotificationPermissionDenied(false)}
                style={styles.eventFollowSecondaryButton}
              >
                <Text style={styles.eventFollowSecondaryText}>Nicht jetzt</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setEventNotificationPermissionDenied(false);
                  void Linking.openSettings();
                }}
                style={styles.eventFollowPrimaryButton}
              >
                <Text style={styles.eventFollowPrimaryText}>Einstellungen öffnen</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {eventFollowMessage ? (
        <View pointerEvents="none" style={[styles.eventFollowToast, { bottom: Math.max(22, insets.bottom + 12) }]}>
          <Ionicons name="checkmark-circle" size={19} color={colors.white} />
          <Text style={styles.eventFollowToastText}>{eventFollowMessage}</Text>
        </View>
      ) : null}

      <Modal
        visible={!!selectedEvent}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedEvent(null)}
      >
        <View style={styles.eventModalWrap}>
          <Pressable style={styles.eventModalBackdrop} onPress={() => setSelectedEvent(null)} />
          <View style={styles.eventModalCard}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.eventModalContent}>
              <View style={styles.eventModalHeader}>
                <View style={styles.eventModalIconWrap}>
                  <Ionicons name="sparkles-outline" size={22} color={colors.white} />
                </View>
                <View style={styles.eventModalHeaderActions}>
                  <Pressable
                    disabled={eventFollowBusy}
                    onPress={() => handleEventFavoritePress(selectedEvent)}
                    style={styles.eventModalClose}
                  >
                    <Ionicons
                      name={isFollowingEventProvider(selectedEvent) ? 'star' : 'star-outline'}
                      size={19}
                      color={isFollowingEventProvider(selectedEvent) ? '#B77900' : colors.ink}
                    />
                  </Pressable>
                  <Pressable onPress={() => handleShareEvent(selectedEvent)} style={styles.eventModalClose}>
                    <Ionicons name="share-social-outline" size={18} color={colors.ink} />
                  </Pressable>
                  <Pressable onPress={() => setSelectedEvent(null)} style={styles.eventModalClose}>
                    <Ionicons name="close" size={18} color={colors.ink} />
                  </Pressable>
                </View>
              </View>
              <Text style={styles.eventModalTitle}>{selectedEvent?.title || 'Event'}</Text>
              <Text style={styles.eventModalProvider}>{selectedEvent?.provider?.name || 'Anbieter'}</Text>
              {selectedEvent?.occurrenceCancelled ? (
                <View style={styles.eventCancelledNotice}>
                  <Ionicons name="alert-circle-outline" size={20} color={colors.accentWarm} />
                  <View style={styles.eventCancelledNoticeTextWrap}>
                    <Text style={styles.eventCancelledNoticeTitle}>Dieser Termin wurde abgesagt</Text>
                    {selectedEvent.cancellationReason ? (
                      <Text style={styles.eventCancelledNoticeText}>{selectedEvent.cancellationReason}</Text>
                    ) : null}
                  </View>
                </View>
              ) : null}
              {selectedEvent?.imageUrl ? (
                <Pressable
                  style={styles.eventModalImageButton}
                  onPress={() => setEventImagePreviewUrl(selectedEvent.imageUrl)}
                >
                  <Image source={{ uri: selectedEvent.imageUrl }} style={styles.eventModalImage} resizeMode="cover" />
                </Pressable>
              ) : null}
              <View style={styles.eventModalMetaGrid}>
                <View style={styles.eventModalMetaItem}>
                  <Ionicons name="calendar-outline" size={17} color={colors.accent} />
                  <Text style={styles.eventModalMetaText}>
                    {formatEventDateTime(selectedEvent?.occurrenceStartAt || selectedEvent?.startAt)}
                  </Text>
                </View>
                {formatEventRecurrenceDetail(selectedEvent) ? (
                  <View style={styles.eventModalMetaItem}>
                    <Ionicons name="repeat-outline" size={17} color={colors.accent} />
                    <Text style={styles.eventModalMetaText}>{formatEventRecurrenceDetail(selectedEvent)}</Text>
                  </View>
                ) : null}
                <View style={styles.eventModalMetaItem}>
                  <Ionicons name="location-outline" size={17} color={colors.accent} />
                  <Text style={styles.eventModalMetaText}>
                    {[selectedEvent?.venueName, selectedEvent?.address, selectedEvent?.postalCode]
                      .filter(Boolean)
                      .join(' · ') || 'Ort folgt'}
                  </Text>
                </View>
              </View>
              <View style={styles.eventModalTagRow}>
                {(selectedEvent?.tags || []).map((tag) => (
                  <Text key={tag} style={styles.eventModalTag}>
                    #{eventTagLabelByKey[tag] || tag}
                  </Text>
                ))}
              </View>
              {selectedEvent?.description ? (
                <Text style={styles.eventModalDescription}>{selectedEvent.description}</Text>
              ) : null}
              <Pressable
                style={styles.eventProviderCard}
                onPress={() => setEventOrganizerExpanded((expanded) => !expanded)}
                accessibilityRole="button"
                accessibilityState={{ expanded: eventOrganizerExpanded }}
                accessibilityLabel={`Veranstalter ${eventOrganizerExpanded ? 'schließen' : 'öffnen'}`}
              >
                <View style={styles.eventProviderSummary}>
                  <View style={styles.eventProviderSummaryText}>
                    <Text style={styles.eventProviderTitle}>Veranstalter</Text>
                    <Text style={styles.eventProviderName}>{selectedEvent?.provider?.name || 'Anbieter'}</Text>
                  </View>
                  <Ionicons
                    name={eventOrganizerExpanded ? 'chevron-up' : 'chevron-down'}
                    size={20}
                    color={colors.muted}
                  />
                </View>
                {eventOrganizerExpanded &&
                hasDistinctProviderDescription(
                  selectedEvent?.provider?.eventProfile?.offeringsText,
                  selectedEvent?.description
                ) ? (
                  <View style={styles.eventProviderAbout}>
                    <Text style={styles.eventProviderAboutLabel}>Über den Veranstalter</Text>
                    <Text style={styles.eventProviderText}>
                      {selectedEvent.provider.eventProfile.offeringsText}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
              <View style={styles.eventActionRow}>
                {selectedEvent?.ticketUrl ? (
                  <Pressable
                    onPress={() => handleOpenExternalLink(selectedEvent.ticketUrl)}
                    style={styles.eventActionButton}
                  >
                    <Ionicons name="ticket-outline" size={17} color={colors.white} />
                    <Text style={styles.eventActionButtonText}>Ticket / Reservierung</Text>
                  </Pressable>
                ) : null}
                {selectedEvent?.contactUrl ? (
                  <Pressable
                    onPress={() => handleOpenExternalLink(selectedEvent.contactUrl)}
                    style={styles.eventActionButtonSecondary}
                  >
                    <Ionicons name="globe-outline" size={17} color={colors.ink} />
                    <Text style={styles.eventActionSecondaryText}>Kontakt öffnen</Text>
                  </Pressable>
                ) : null}
                {selectedEvent?.contactEmail ? (
                  <Pressable
                    onPress={() => handleOpenExternalLink(`mailto:${selectedEvent.contactEmail}`)}
                    style={styles.eventActionButtonSecondary}
                  >
                    <Ionicons name="mail-outline" size={17} color={colors.ink} />
                    <Text style={styles.eventActionSecondaryText}>E-Mail</Text>
                  </Pressable>
                ) : null}
                {selectedEvent?.contactPhone ? (
                  <Pressable
                    onPress={() => handleOpenExternalLink(`tel:${selectedEvent.contactPhone}`)}
                    style={styles.eventActionButtonSecondary}
                  >
                    <Ionicons name="call-outline" size={17} color={colors.ink} />
                    <Text style={styles.eventActionSecondaryText}>Anrufen</Text>
                  </Pressable>
                ) : null}
              </View>
              {selectedEvent?.socialLinks?.length ? (
                <View style={styles.eventSocialPublicSection}>
                  <Text style={styles.eventProviderTitle}>Social Media</Text>
                  <View style={styles.eventSocialPublicRow}>
                    {selectedEvent.socialLinks.map((entry, index) => (
                      <Pressable
                        key={`${entry.platform}-${entry.url}-${index}`}
                        style={styles.eventSocialPublicButton}
                        onPress={() => handleOpenExternalLink(entry.url)}
                      >
                        <Ionicons name={eventSocialIcon(entry.platform)} size={16} color={colors.ink} />
                        <Text style={styles.eventSocialPublicText}>{entry.platform}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!eventImagePreviewUrl}
        transparent
        animationType="fade"
        onRequestClose={() => setEventImagePreviewUrl('')}
      >
        <View style={styles.eventImagePreviewWrap}>
          <Pressable style={styles.eventImagePreviewBackdrop} onPress={() => setEventImagePreviewUrl('')} />
          <View style={styles.eventImagePreviewCard}>
            <Pressable style={styles.eventImagePreviewClose} onPress={() => setEventImagePreviewUrl('')}>
              <Ionicons name="close" size={20} color={colors.white} />
            </Pressable>
            {eventImagePreviewUrl ? (
              <Image source={{ uri: eventImagePreviewUrl }} style={styles.eventImagePreviewImage} resizeMode="contain" />
            ) : null}
          </View>
        </View>
      </Modal>

      <Modal visible={!!selectedOffer} transparent animationType="none" onRequestClose={handleCloseOffer}>
        <View style={styles.offerModalOverlay}>
          <Pressable style={styles.offerModalBackdrop} onPress={handleCloseOffer}>
            <Animated.View style={[styles.modalBackdropFill, { opacity: overlayOpacity }]} />
          </Pressable>
          <Animated.View style={offerModalCardStyles}>
            {!selectedOfferIsRestaurantOnly ? (
            <ScrollView
              style={styles.offerModalScroll}
              contentContainerStyle={styles.offerModalScrollContent}
              showsVerticalScrollIndicator={false}
              keyboardDismissMode="on-drag"
              keyboardShouldPersistTaps="handled"
              onScroll={handleOfferScroll}
              scrollEventThrottle={16}
            >
              <LinearGradient
                colors={['#3D9F79', '#4BB489', '#5CC4A0']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.offerHero}
              >
                <View style={styles.offerHeroTopRow}>
                  <Pressable onPress={handleCloseOffer} style={styles.offerHeroIconButton}>
                    <Ionicons name="chevron-back" size={22} color={colors.white} />
                  </Pressable>
                </View>

                <View style={styles.offerHeroImageRing}>
                  {selectedOfferImage ? (
                    <Image source={{ uri: selectedOfferImage }} style={styles.offerHeroImage} />
                  ) : (
                    <View style={styles.offerHeroPlaceholder}>
                      <Text style={styles.offerHeroPlaceholderText}>{selectedOfferInitial}</Text>
                    </View>
                  )}
                </View>
              </LinearGradient>

              <View style={styles.offerDetailSheet}>
                <View style={styles.offerDetailSheetContent}>
                  {selectedOffer?.description ? (
                    <Text style={styles.offerLeadText}>{selectedOffer.description}</Text>
                  ) : null}

                  <View style={styles.offerTitleRow}>
                    <View style={styles.offerTitleWrap}>
                      {!selectedOffer?.isRestaurantOnly ? (
                        <View style={styles.offerTypeBadge}>
                          <Ionicons
                            name={selectedOfferIsLunchMenu ? 'sunny-outline' : 'pricetag'}
                            size={12}
                            color={colors.white}
                          />
                          <Text style={styles.offerTypeBadgeText}>
                            {selectedOfferIsLunchMenu ? 'Mittagstisch' : 'Angebot'}
                          </Text>
                        </View>
                      ) : null}
                      <Text style={styles.offerModalTitle}>{selectedOffer?.title}</Text>
                      {selectedOfferIsLunchMenu && selectedLunchMenuAvailability ? (
                        <Text style={styles.offerModalMeta}>
                          Verfügbar: {selectedLunchMenuAvailability}
                        </Text>
                      ) : null}
                      <Text style={styles.offerModalMeta}>
                        {selectedOffer?.distanceKm != null
                          ? `${selectedOffer.distanceKm.toFixed(1).replace('.', ',')} km entfernt`
                          : 'Distanz unbekannt'}
                      </Text>
                    </View>
                    <Text style={styles.offerPortionText}>
                      {selectedOffer?.isRestaurantOnly
                        ? 'Restaurant'
                        : selectedOfferIsLunchMenu
                        ? 'Mittagstisch'
                        : '1 portion'}
                    </Text>
                  </View>

                  <Pressable
                    onPress={handleOpenRestaurantInfo}
                    style={({ pressed }) => [
                      styles.offerRestaurantCard,
                      pressed && styles.offerRestaurantCardPressed
                    ]}
                  >
                    {selectedRestaurantLogoSource ? (
                      <Image source={selectedRestaurantLogoSource} style={styles.offerRestaurantLogo} />
                    ) : null}
                    <View style={styles.offerRestaurantMain}>
                      <Text style={styles.offerRestaurantName}>{selectedOffer?.restaurant}</Text>
                      <Text style={styles.offerRestaurantInfo}>
                        {selectedOffer?.address ? selectedOffer.address : 'Adresse folgt'}
                      </Text>
                    </View>
                    <View style={styles.offerStars}>
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Ionicons
                          key={star}
                          name={star <= Math.round(selectedRatingAverage || 0) ? 'star' : 'star-outline'}
                          size={13}
                          color="#F59E0B"
                        />
                      ))}
                    </View>
                  </Pressable>
                  <Text style={styles.offerRestaurantHint}>
                    Tippe auf das Restaurant für Infos und Menü.
                  </Text>
                  <Pressable
                    style={[styles.offerContactRow, !selectedOffer?.phone && styles.offerContactRowDisabled]}
                    onPress={handleCallRestaurant}
                    disabled={!selectedOffer?.phone}
                  >
                    <Ionicons name="call" size={16} color={colors.accent} />
                    <Text style={styles.offerContactText}>
                      {selectedOffer?.phone ? selectedOffer.phone : 'Telefon folgt'}
                    </Text>
                  </Pressable>

                  {!selectedOffer?.isRestaurantOnly && Number.isFinite(Number(selectedOffer?.price)) ? (
                    <View style={styles.offerPriceRow}>
                      <Text style={styles.offerPriceLabel}>Preis</Text>
                      <Text style={styles.offerModalPrice}>{formatPrice(selectedOffer?.price)}</Text>
                    </View>
                  ) : null}

                  {selectedOfferIsOrderable && selectedOffer?.offerId ? (
                    <View style={styles.actionPanelWrap}>
                      <Pressable
                        style={styles.actionPanelToggle}
                        onPress={() => setPreorderPanelOpen((prev) => !prev)}
                      >
                        <Text style={styles.actionPanelTitle}>Vorbestellen</Text>
                        <Ionicons
                          name={preorderPanelOpen ? 'chevron-up' : 'chevron-down'}
                          size={18}
                          color={colors.ink}
                        />
                      </Pressable>
                      {preorderPanelOpen ? (
                        selectedOffer?.preorderEnabled ? (
                          <View style={styles.orderForm}>
                            <TextInput
                              placeholder="Dein Name"
                              value={orderName}
                              onChangeText={setOrderName}
                              returnKeyType="done"
                              blurOnSubmit
                              onSubmitEditing={() => Keyboard.dismiss()}
                              style={styles.orderInput}
                            />
                            <TextInput
                              placeholder="E-Mail für Bestätigung"
                              value={orderEmail}
                              onChangeText={setOrderEmail}
                              keyboardType="email-address"
                              autoCapitalize="none"
                              autoCorrect={false}
                              returnKeyType="done"
                              blurOnSubmit
                              onSubmitEditing={() => Keyboard.dismiss()}
                              style={styles.orderInput}
                            />
                            <View style={styles.orderRow}>
                              <TextInput
                                placeholder="Menge"
                                value={orderQty}
                                onChangeText={setOrderQty}
                                keyboardType="number-pad"
                                returnKeyType="done"
                                blurOnSubmit
                                onSubmitEditing={() => Keyboard.dismiss()}
                                style={[styles.orderInput, styles.orderInputSmall, styles.orderInputNoBottom]}
                              />
                            </View>
                            <Text style={styles.timePickerLabel}>Uhrzeit wählen</Text>
                            <ScrollView
                              ref={orderTimeScrollRef}
                              horizontal
                              showsHorizontalScrollIndicator={false}
                              style={styles.timeScroll}
                              contentContainerStyle={styles.timeScrollContent}
                              keyboardShouldPersistTaps="handled"
                              onContentSizeChange={() => centerOrderTimeSelection(orderTime, false)}
                            >
                              {orderTimeOptions.map((time) => (
                                <Pressable
                                  key={time}
                                  onPress={() => {
                                    setOrderTime(time);
                                    centerOrderTimeSelection(time, true);
                                  }}
                                  style={[styles.timeChip, orderTime === time && styles.timeChipActive]}
                                >
                                  <Text
                                    style={[styles.timeChipText, orderTime === time && styles.timeChipTextActive]}
                                  >
                                    {time}
                                  </Text>
                                </Pressable>
                              ))}
                            </ScrollView>
                            <View style={styles.orderTypeRow}>
                              <Pressable
                                onPress={() => setOrderType('pickup')}
                                style={[
                                  styles.orderTypeChip,
                                  orderType === 'pickup' && styles.orderTypeActive
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.orderTypeText,
                                    orderType === 'pickup' && styles.orderTypeTextActive
                                  ]}
                                >
                                  Abholen
                                </Text>
                              </Pressable>
                              <Pressable
                                onPress={() => setOrderType('dinein')}
                                style={[
                                  styles.orderTypeChip,
                                  orderType === 'dinein' && styles.orderTypeActive
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.orderTypeText,
                                    orderType === 'dinein' && styles.orderTypeTextActive
                                  ]}
                                >
                                  Vor Ort essen
                                </Text>
                              </Pressable>
                            </View>
                            <Pressable style={styles.preorderButton} onPress={handlePlaceOrder}>
                              <Ionicons name="fast-food" size={18} color={colors.white} />
                              <Text style={styles.preorderText}>Vorbestellen</Text>
                            </Pressable>
                            {orderLocalError ? (
                              <Text style={styles.orderError}>{orderLocalError}</Text>
                            ) : null}
                            {orderError ? <Text style={styles.orderError}>{orderError}</Text> : null}
                            {orderStatus ? <Text style={styles.orderSuccess}>{orderStatus}</Text> : null}
                          </View>
                        ) : (
                          <Text style={styles.preorderDisabled}>
                            Vorbestellung ist für dieses Angebot deaktiviert.
                          </Text>
                        )
                      ) : null}
                    </View>
                  ) : null}

                  {selectedReservationMode === 'app' ? (
                    <View style={styles.actionPanelWrap}>
                      <Pressable
                        style={styles.actionPanelToggle}
                        onPress={() => setReservationPanelOpen((prev) => !prev)}
                      >
                        <Text style={styles.actionPanelTitle}>Tisch reservieren</Text>
                        <Ionicons
                          name={reservationPanelOpen ? 'chevron-up' : 'chevron-down'}
                          size={18}
                          color={colors.ink}
                        />
                      </Pressable>
                      {reservationPanelOpen ? renderAppReservationForm('reservation') : null}
                    </View>
                  ) : null}
                  {selectedReservationMode === 'external' ? (
                    renderExternalReservationActions()
                  ) : null}
                </View>
              </View>
            </ScrollView>
            ) : null}

            {!selectedOfferIsRestaurantOnly ? (
            <Animated.View
              pointerEvents={isOfferHeaderCompact ? 'auto' : 'none'}
              style={[styles.offerCompactHeader, compactHeaderStyle]}
            >
              <Pressable onPress={handleCloseOffer} style={styles.offerCompactBackButton}>
                <Ionicons name="chevron-back" size={19} color={colors.ink} />
              </Pressable>
              <View style={styles.offerCompactThumb}>
                {selectedOfferImage ? (
                  <Image source={{ uri: selectedOfferImage }} style={styles.offerCompactThumbImage} />
                ) : (
                  <Text style={styles.offerCompactThumbInitial}>{selectedOfferInitial}</Text>
                )}
              </View>
              <Text numberOfLines={1} style={styles.offerCompactTitle}>
                {selectedOffer?.title}
              </Text>
            </Animated.View>
            ) : null}

            {showRestaurantInfoPanel ? (
              <View style={styles.restaurantInfoLayer}>
                {!selectedOfferIsRestaurantOnly ? (
                  <Pressable
                    style={styles.restaurantInfoBackdrop}
                    onPress={handleCloseRestaurantInfo}
                  />
                ) : null}
                <KeyboardAvoidingView
                  behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                  style={styles.restaurantInfoModalWrap}
                >
                  <View style={styles.restaurantInfoCard}>
                    <View style={styles.restaurantInfoHeader}>
                      <View style={styles.restaurantInfoHeaderMain}>
                        {selectedRestaurantLogoSource ? (
                          <Image source={selectedRestaurantLogoSource} style={styles.restaurantInfoLogo} />
                        ) : null}
                        <View style={styles.restaurantInfoTextWrap}>
                          <Text style={styles.restaurantInfoTitle}>{selectedOffer?.restaurant}</Text>
                          <Text style={styles.restaurantInfoSubtitle}>
                            {selectedOffer?.address ? selectedOffer.address : 'Adresse folgt'}
                          </Text>
                          {selectedOffer?.restaurantCuisineTypes?.length ? (
                            <Text style={styles.restaurantInfoCuisine}>
                              Küche: {selectedOffer.restaurantCuisineTypes.join(', ')}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                      <Pressable
                        onPress={handleCloseRestaurantInfo}
                        style={styles.restaurantInfoCloseButton}
                      >
                        <Ionicons name="close" size={20} color={colors.ink} />
                      </Pressable>
                    </View>

                    <ScrollView
                      style={styles.restaurantInfoScroll}
                      contentContainerStyle={styles.restaurantInfoScrollContent}
                      showsVerticalScrollIndicator={false}
                      keyboardDismissMode="on-drag"
                      keyboardShouldPersistTaps="handled"
                    >
                      <View style={styles.restaurantInfoRatingRow}>
                        <View style={styles.offerStars}>
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Ionicons
                              key={star}
                              name={star <= Math.round(selectedRatingAverage || 0) ? 'star' : 'star-outline'}
                              size={16}
                              color="#F59E0B"
                            />
                          ))}
                        </View>
                        <Text style={styles.restaurantInfoRatingCaption}>
                          {selectedReviewCount
                            ? `${selectedRatingAverage.toFixed(1).replace('.', ',')}/5 aus ${selectedReviewCount} Bewertungen`
                            : 'Noch keine Bewertungen'}
                        </Text>
                      </View>

                      {selectedRestaurantAboutText ? (
                        <View style={styles.restaurantAboutCard}>
                          <Text style={styles.restaurantAboutTitle}>Über uns</Text>
                          <Text style={styles.restaurantAboutText}>{visibleRestaurantAboutText}</Text>
                          {showRestaurantAboutToggle ? (
                            <Pressable
                              style={styles.restaurantAboutMoreButton}
                              onPress={() => setRestaurantAboutExpanded((prev) => !prev)}
                            >
                              <Text style={styles.restaurantAboutMoreText}>
                                {restaurantAboutExpanded ? 'Weniger' : 'Mehr'}
                              </Text>
                              <Ionicons
                                name={restaurantAboutExpanded ? 'chevron-up' : 'chevron-down'}
                                size={14}
                                color={colors.accent}
                              />
                            </Pressable>
                          ) : null}
                        </View>
                      ) : null}

                      {selectedRestaurantSocialLinks.length ? (
                        <View style={styles.restaurantSocialCard}>
                          <Text style={styles.restaurantAboutTitle}>Links</Text>
                          <View style={styles.restaurantSocialRow}>
                            {selectedRestaurantSocialLinks.map((entry, index) => (
                              <Pressable
                                key={`${entry.platform || 'link'}-${entry.url}-${index}`}
                                style={styles.restaurantSocialChip}
                                onPress={() => handleOpenExternalLink(entry.url)}
                              >
                                <Ionicons name="link-outline" size={14} color={colors.ink} />
                                <Text style={styles.restaurantSocialChipText}>
                                  {entry.platform || 'Website'}
                                </Text>
                              </Pressable>
                            ))}
                          </View>
                        </View>
                      ) : null}

                      <View style={styles.openingHoursCard}>
                        <View style={styles.openingHoursHead}>
                          <Ionicons name="time-outline" size={16} color={colors.accent} />
                          <Text style={styles.openingHoursTitle}>Öffnungszeiten</Text>
                        </View>

                        {selectedOpeningHoursRows.length ? (
                          selectedOpeningHoursRows.map((row) => (
                            <View key={row.key} style={styles.openingHoursRow}>
                              <Text style={styles.openingHoursDay}>{row.label}</Text>
                              <Text style={styles.openingHoursRange}>{row.range}</Text>
                            </View>
                          ))
                        ) : (
                          <Text style={styles.openingHoursFallback}>Keine Öffnungszeiten hinterlegt.</Text>
                        )}

                        {visibleSpecialClosures.length ? (
                          <View style={styles.specialClosurePublicList}>
                            <Text style={styles.specialClosurePublicTitle}>Schließtage</Text>
                            {visibleSpecialClosures.map((entry) => (
                              <View key={entry.date} style={styles.specialClosurePublicRow}>
                                <Text style={styles.specialClosurePublicDate}>
                                  {formatSpecialClosureLabel(entry.date)}
                                </Text>
                                <Text style={styles.specialClosurePublicReason}>{entry.reason}</Text>
                              </View>
                            ))}
                          </View>
                        ) : null}
                      </View>

                      {selectedOffer?.restaurantId && showLunchMenuButton ? (
                        <Pressable style={styles.restaurantMenuButtonAlt} onPress={handleLoadLunchMenu}>
                          <Ionicons name="sunny-outline" size={16} color={colors.ink} />
                          <Text style={styles.restaurantMenuButtonAltText}>
                            {lunchMenuLoading
                              ? 'Lädt...'
                              : lunchMenuVisible
                              ? 'Mittagstisch Menü schließen'
                              : 'Mittagstisch Menü anzeigen'}
                          </Text>
                        </Pressable>
                      ) : null}

                      {selectedOffer?.restaurantId ? (
                        <Pressable
                          style={[
                            styles.restaurantMenuButton,
                            !hasRegularMenu && styles.restaurantMenuButtonDisabled
                          ]}
                          onPress={handleOpenRegularMenu}
                          disabled={!hasRegularMenu}
                        >
                          <Ionicons
                            name="document-text"
                            size={16}
                            color={hasRegularMenu ? colors.white : colors.muted}
                          />
                          <Text
                            style={[
                              styles.restaurantMenuButtonText,
                              !hasRegularMenu && styles.restaurantMenuButtonTextDisabled
                            ]}
                          >
                            Menü anzeigen
                          </Text>
                        </Pressable>
                      ) : null}

                      {regularMenuLinksVisible ? (
                        <View style={styles.restaurantMenuChoiceRow}>
                          <Pressable style={styles.restaurantMenuChoiceButton} onPress={handleLoadDigitalMenu}>
                            <Ionicons name="sparkles" size={15} color={colors.ink} />
                            <Text style={styles.restaurantMenuChoiceText}>Digital</Text>
                          </Pressable>
                          <Pressable style={styles.restaurantMenuChoiceButton} onPress={handleOpenRestaurantMenu}>
                            <Ionicons name="document-text-outline" size={15} color={colors.ink} />
                            <Text style={styles.restaurantMenuChoiceText}>PDF</Text>
                          </Pressable>
                        </View>
                      ) : null}

                      <Pressable
                        style={[styles.offerContactRow, !selectedOffer?.phone && styles.offerContactRowDisabled]}
                        onPress={handleCallRestaurant}
                        disabled={!selectedOffer?.phone}
                      >
                        <Ionicons name="call" size={16} color={colors.accent} />
                        <Text style={styles.offerContactText}>
                          {selectedOffer?.phone ? selectedOffer.phone : 'Telefon folgt'}
                        </Text>
                      </Pressable>

                      {lunchMenuError ? <Text style={styles.ratingError}>{lunchMenuError}</Text> : null}
                      {lunchMenuVisible ? (
                        <View style={styles.publicMenuList}>
                          {groupedLunchMenuItems.length ? (
                            groupedLunchMenuItems.map((group, groupIndex) => (
                              <View
                                key={`lunch-${group.section}`}
                                style={[
                                  styles.publicMenuCategoryBlock,
                                  groupIndex === groupedLunchMenuItems.length - 1 &&
                                    styles.publicMenuCategoryBlockLast
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.publicMenuCategoryTitle,
                                    styles[`publicMenuCategoryTitleTone${detectMenuSectionTone(group.section)}`]
                                  ]}
                                >
                                  {group.section}
                                </Text>
                                {group.items.map((item) => (
                                  <Pressable
                                    key={item.id || `${item.name}-${item.price}`}
                                    style={({ pressed }) => [styles.publicMenuRow, pressed && styles.publicMenuRowPressed]}
                                    onPress={() => handleOpenPublicMenuItem(item, 'lunch')}
                                  >
                                    <View style={styles.publicMenuHead}>
                                      <View style={styles.publicMenuNameRow}>
                                        <Text style={styles.publicMenuName}>{item.name}</Text>
                                        <PublicMenuCategoryBadge category={item.category} />
                                      </View>
                                      <Text style={styles.publicMenuPrice}>{formatPrice(item.price)}</Text>
                                    </View>
                                    {item.description ? (
                                      <Text style={styles.publicMenuDescription}>{item.description}</Text>
                                    ) : null}
                                    {formatLunchMenuSchedule(item) ? (
                                      <Text style={styles.publicMenuSchedule}>
                                        {formatLunchMenuSchedule(item)}
                                      </Text>
                                    ) : null}
                                    {Array.isArray(item.allergens) && item.allergens.length ? (
                                      <View style={styles.publicMenuItemAllergenWrap}>
                                        <Text style={styles.publicMenuItemAllergenLabel}>Allergene:</Text>
                                        <View style={styles.publicMenuItemAllergenRow}>
                                          {item.allergens.map((entry, index) => (
                                            <View
                                              key={`${item.id || item.name}-lunch-item-allergen-${index}`}
                                              style={styles.publicMenuItemAllergenChip}
                                            >
                                              <Text style={styles.publicMenuItemAllergenChipText}>{entry}</Text>
                                            </View>
                                          ))}
                                        </View>
                                      </View>
                                    ) : null}
                                  </Pressable>
                                ))}
                              </View>
                            ))
                          ) : (
                            <Text style={styles.publicMenuEmptyFiltered}>
                              Kein Mittagstisch-Menü vorhanden.
                            </Text>
                          )}
                          {lunchMenuUpdatedAt ? (
                            <Text style={styles.publicMenuMeta}>
                              Stand:{' '}
                              {new Date(lunchMenuUpdatedAt).toLocaleString('de-DE', {
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </Text>
                          ) : null}
                          <View style={styles.publicMenuAllergenSection}>
                            <Text style={styles.publicMenuAllergenTitle}>Allergene</Text>
                            {lunchMenuAllergens.length ? (
                              <View style={styles.publicMenuAllergenRow}>
                                {lunchMenuAllergens.map((entry, index) => (
                                  <View key={`${entry}-${index}`} style={styles.publicMenuAllergenChip}>
                                    <Text style={styles.publicMenuAllergenChipText}>{entry}</Text>
                                  </View>
                                ))}
                              </View>
                            ) : (
                              <Text style={styles.publicMenuAllergenEmpty}>
                                Keine Allergene hinterlegt.
                              </Text>
                            )}
                          </View>
                        </View>
                      ) : null}

                      {digitalMenuError ? <Text style={styles.ratingError}>{digitalMenuError}</Text> : null}
                      {digitalMenuVisible ? (
                        <View style={styles.publicMenuList}>
                          <View style={styles.publicMenuFilterRow}>
                            {digitalMenuDietFilterOptions.map((option) => (
                              <FilterChip
                                key={`public-digital-filter-${option.key}`}
                                label={option.label}
                                active={digitalMenuDietFilter === option.key}
                                tone={
                                  option.key === 'vegan'
                                    ? 'green'
                                    : option.key === 'vegetarian'
                                    ? 'gold'
                                    : undefined
                                }
                                onPress={() => setDigitalMenuDietFilter(option.key)}
                              />
                            ))}
                          </View>
                          {groupedDigitalMenuItems.length ? (
                            groupedDigitalMenuItems.map((group, groupIndex) => (
                              <View
                                key={group.section}
                                style={[
                                  styles.publicMenuCategoryBlock,
                                  groupIndex === groupedDigitalMenuItems.length - 1 &&
                                    styles.publicMenuCategoryBlockLast
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.publicMenuCategoryTitle,
                                    styles[`publicMenuCategoryTitleTone${detectMenuSectionTone(group.section)}`]
                                  ]}
                                >
                                  {group.section}
                                </Text>
                                {group.items.map((item) => (
                                  <Pressable
                                    key={item.id || `${item.name}-${item.price}`}
                                    style={({ pressed }) => [styles.publicMenuRow, pressed && styles.publicMenuRowPressed]}
                                    onPress={() => handleOpenPublicMenuItem(item, 'regular')}
                                  >
                                    <View style={styles.publicMenuHead}>
                                      <View style={styles.publicMenuNameRow}>
                                        <Text style={styles.publicMenuName}>{item.name}</Text>
                                        <PublicMenuCategoryBadge category={item.category} />
                                      </View>
                                      <Text style={styles.publicMenuPrice}>{formatPrice(item.price)}</Text>
                                    </View>
                                    {item.description ? (
                                      <Text style={styles.publicMenuDescription}>{item.description}</Text>
                                    ) : null}
                                    {Array.isArray(item.allergens) && item.allergens.length ? (
                                      <View style={styles.publicMenuItemAllergenWrap}>
                                        <Text style={styles.publicMenuItemAllergenLabel}>Allergene:</Text>
                                        <View style={styles.publicMenuItemAllergenRow}>
                                          {item.allergens.map((entry, index) => (
                                            <View
                                              key={`${item.id || item.name}-item-allergen-${index}`}
                                              style={styles.publicMenuItemAllergenChip}
                                            >
                                              <Text style={styles.publicMenuItemAllergenChipText}>{entry}</Text>
                                            </View>
                                          ))}
                                        </View>
                                      </View>
                                    ) : null}
                                  </Pressable>
                                ))}
                              </View>
                            ))
                          ) : (
                            <Text style={styles.publicMenuEmptyFiltered}>
                              Keine Gerichte für den gewählten Filter.
                            </Text>
                          )}
                          {digitalMenuUpdatedAt ? (
                            <Text style={styles.publicMenuMeta}>
                              Stand:{' '}
                              {new Date(digitalMenuUpdatedAt).toLocaleString('de-DE', {
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </Text>
                          ) : null}
                          <View style={styles.publicMenuAllergenSection}>
                            <Text style={styles.publicMenuAllergenTitle}>Allergene</Text>
                            {digitalMenuAllergens.length ? (
                              <View style={styles.publicMenuAllergenRow}>
                                {digitalMenuAllergens.map((entry, index) => (
                                  <View key={`${entry}-${index}`} style={styles.publicMenuAllergenChip}>
                                    <Text style={styles.publicMenuAllergenChipText}>{entry}</Text>
                                  </View>
                                ))}
                              </View>
                            ) : (
                              <Text style={styles.publicMenuAllergenEmpty}>
                                Keine Allergene hinterlegt.
                              </Text>
                            )}
                          </View>
                        </View>
                      ) : null}

                      {selectedReservationMode === 'app' ? (
                        <View style={styles.actionPanelWrap}>
                          <Pressable
                            style={styles.actionPanelToggle}
                            onPress={() => setReservationInfoPanelOpen((prev) => !prev)}
                          >
                            <Text style={styles.actionPanelTitle}>Tisch reservieren</Text>
                            <Ionicons
                              name={reservationInfoPanelOpen ? 'chevron-up' : 'chevron-down'}
                              size={18}
                              color={colors.ink}
                            />
                          </Pressable>
                          {reservationInfoPanelOpen ? renderAppReservationForm('info-reservation') : null}
                        </View>
                      ) : null}
                      {selectedReservationMode === 'external' ? (
                        renderExternalReservationActions()
                      ) : null}

                      <View style={[styles.ratingSection, styles.restaurantRatingSection]}>
                        <View style={styles.reviewSectionHeader}>
                          <View style={styles.reviewSectionHeaderText}>
                            <Text style={styles.actionPanelTitle}>Bewertungen</Text>
                            <Text style={styles.reviewSectionSubtitle}>
                              {selectedReviewCount
                                ? `${selectedReviewCount} öffentliche Bewertungen`
                                : 'Noch keine öffentliche Bewertung'}
                            </Text>
                          </View>
                          <Pressable style={styles.reviewWriteButton} onPress={handleOpenReviewComposer}>
                            <Ionicons name="create-outline" size={15} color={colors.white} />
                            <Text style={styles.reviewWriteButtonText}>Bewertung schreiben</Text>
                          </Pressable>
                        </View>
                        {reviewStatus ? <Text style={styles.ratingSuccess}>{reviewStatus}</Text> : null}
                        {reviewsLoading ? (
                          <Text style={styles.reviewEmptyText}>Bewertungen werden geladen...</Text>
                        ) : reviewsError ? (
                          <Text style={styles.ratingError}>{reviewsError}</Text>
                        ) : restaurantReviews.length ? (
                          <View style={styles.reviewList}>
                            {restaurantReviews.map((review) => (
                              <View key={review.id} style={styles.reviewCard}>
                                <View style={styles.reviewCardHeader}>
                                  <View style={styles.reviewAuthorBlock}>
                                    <View style={styles.offerStars}>
                                      {[1, 2, 3, 4, 5].map((star) => (
                                        <Ionicons
                                          key={`${review.id}-star-${star}`}
                                          name={star <= Number(review.rating || 0) ? 'star' : 'star-outline'}
                                          size={14}
                                          color="#F59E0B"
                                        />
                                      ))}
                                    </View>
                                    <Text style={styles.reviewAuthor}>
                                      {review.authorName || 'Gast'}
                                    </Text>
                                  </View>
                                  <Text style={styles.reviewDate}>{formatReviewDate(review.createdAt)}</Text>
                                </View>
                                <Text style={styles.reviewText}>{review.text}</Text>
                                {Array.isArray(review.images) && review.images.length ? (
                                  <ScrollView
                                    horizontal
                                    showsHorizontalScrollIndicator={false}
                                    style={styles.reviewImageScroll}
                                    contentContainerStyle={styles.reviewImageRow}
                                  >
                                    {review.images.map((image, index) => (
                                      <Image
                                        key={image.id || `${review.id}-image-${index}`}
                                        source={{ uri: image.url }}
                                        style={styles.reviewImage}
                                      />
                                    ))}
                                  </ScrollView>
                                ) : null}
                                {review.replyText ? (
                                  <View style={styles.reviewReplyBox}>
                                    <Text style={styles.reviewReplyLabel}>Antwort des Restaurants</Text>
                                    <Text style={styles.reviewReplyText}>{review.replyText}</Text>
                                  </View>
                                ) : null}
                              </View>
                            ))}
                          </View>
                        ) : (
                          <Text style={styles.reviewEmptyText}>
                            Sei die erste Person, die dieses Restaurant bewertet.
                          </Text>
                        )}
                      </View>
                    </ScrollView>
                  </View>
                </KeyboardAvoidingView>
              </View>
            ) : null}
          </Animated.View>
          {selectedMenuItem ? (
            <View style={styles.menuItemDetailLayer}>
              <Pressable style={styles.menuItemDetailBackdrop} onPress={() => setSelectedMenuItem(null)} />
              <View style={styles.menuItemDetailCard}>
                <View style={styles.menuItemDetailHeader}>
                  <View style={styles.menuItemDetailTitleWrap}>
                    <Text style={styles.menuItemDetailTitle}>{selectedMenuItem.name}</Text>
                    <Text style={styles.menuItemDetailPrice}>{formatPrice(selectedMenuItem.price)}</Text>
                  </View>
                  <Pressable style={styles.restaurantInfoCloseButton} onPress={() => setSelectedMenuItem(null)}>
                    <Ionicons name="close" size={20} color={colors.ink} />
                  </Pressable>
                </View>
                {selectedMenuItem.description ? (
                  <Text style={styles.menuItemDetailDescription}>{selectedMenuItem.description}</Text>
                ) : null}
                {selectedMenuItem.menuKind === 'lunch' && formatLunchMenuSchedule(selectedMenuItem) ? (
                  <Text style={styles.menuItemDetailSchedule}>{formatLunchMenuSchedule(selectedMenuItem)}</Text>
                ) : null}
                {Array.isArray(selectedMenuItem.allergens) && selectedMenuItem.allergens.length ? (
                  <View style={styles.menuItemDetailAllergens}>
                    <Text style={styles.publicMenuItemAllergenLabel}>Allergene</Text>
                    <Text style={styles.menuItemDetailAllergenText}>{selectedMenuItem.allergens.join(', ')}</Text>
                  </View>
                ) : null}
                <View style={styles.menuItemDetailActions}>
                  <Pressable
                    style={[styles.menuItemDetailCallButton, !selectedOffer?.phone && styles.menuItemDetailActionDisabled]}
                    onPress={handleCallRestaurant}
                    disabled={!selectedOffer?.phone}
                  >
                    <Ionicons name="call-outline" size={17} color={colors.white} />
                    <Text style={styles.menuItemDetailCallText}>Restaurant anrufen</Text>
                  </Pressable>
                  {selectedMenuItemOffer?.preorderEnabled ? (
                    <Pressable style={styles.menuItemDetailPreorderButton} onPress={handlePreorderMenuItem}>
                      <Ionicons name="bag-handle-outline" size={17} color={colors.accent} />
                      <Text style={styles.menuItemDetailPreorderText}>Vorbestellen</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            </View>
          ) : null}
          {reviewComposerOpen ? (
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={styles.reviewComposerLayer}
            >
              <Pressable
                style={styles.reviewComposerBackdrop}
                onPress={() => {
                  setReviewComposerOpen(false);
                  resetReviewComposer();
                }}
              />
              <View style={styles.reviewComposerCard}>
                <View style={styles.reviewComposerHeader}>
                  <View>
                    <Text style={styles.reviewComposerEyebrow}>Öffentliche Bewertung</Text>
                    <Text style={styles.reviewComposerTitle}>
                      {selectedOffer?.restaurant || 'Restaurant'} bewerten
                    </Text>
                  </View>
                  <Pressable
                    style={styles.restaurantInfoCloseButton}
                    onPress={() => {
                      setReviewComposerOpen(false);
                      resetReviewComposer();
                    }}
                  >
                    <Ionicons name="close" size={20} color={colors.ink} />
                  </Pressable>
                </View>

                <View style={styles.reviewComposerStars}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Pressable
                      key={`composer-star-${star}`}
                      onPress={() => {
                        setReviewRating(star);
                        setReviewError('');
                      }}
                      style={styles.ratingStarButton}
                    >
                      <Ionicons
                        name={star <= reviewRating ? 'star' : 'star-outline'}
                        size={31}
                        color="#F59E0B"
                      />
                    </Pressable>
                  ))}
                </View>

                <TextInput
                  placeholder="Dein Name (optional)"
                  value={reviewAuthorName}
                  onChangeText={setReviewAuthorName}
                  style={styles.reviewComposerInput}
                  returnKeyType="done"
                />
                <TextInput
                  placeholder="Was hat dir gefallen?"
                  value={reviewText}
                  onChangeText={setReviewText}
                  style={[styles.reviewComposerInput, styles.reviewComposerTextArea]}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />

                <View style={styles.reviewComposerImageBar}>
                  <Pressable style={styles.reviewImagePickerButton} onPress={handlePickReviewImages}>
                    <Ionicons name="images-outline" size={16} color={colors.ink} />
                    <Text style={styles.reviewImagePickerText}>
                      Bilder hinzufügen ({reviewImages.length}/5)
                    </Text>
                  </Pressable>
                </View>
                {reviewImages.length ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.reviewPickedImageScroll}
                    contentContainerStyle={styles.reviewImageRow}
                  >
                    {reviewImages.map((image, index) => (
                      <View key={`${image.uri || image.name}-${index}`} style={styles.reviewPickedImageWrap}>
                        <Image source={{ uri: image.uri }} style={styles.reviewPickedImage} />
                        <Pressable
                          style={styles.reviewPickedImageRemove}
                          onPress={() => setReviewImages((prev) => prev.filter((_, itemIndex) => itemIndex !== index))}
                        >
                          <Ionicons name="close" size={13} color={colors.white} />
                        </Pressable>
                      </View>
                    ))}
                  </ScrollView>
                ) : null}

                {reviewError ? <Text style={styles.ratingError}>{reviewError}</Text> : null}
                <Pressable
                  style={[styles.reviewSubmitButton, reviewSubmitting && styles.reviewSubmitButtonDisabled]}
                  onPress={handleSubmitReview}
                  disabled={reviewSubmitting}
                >
                  <Text style={styles.reviewSubmitButtonText}>
                    {reviewSubmitting ? 'Wird gesendet...' : 'Bewertung veröffentlichen'}
                  </Text>
                </Pressable>
              </View>
            </KeyboardAvoidingView>
          ) : null}
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.page,
    width: '100%',
    minWidth: 0,
    overflow: 'hidden'
  },
  offerList: {
    width: '100%',
    minWidth: 0
  },
  listContent: {
    padding: spacing.lg,
    width: '100%',
    minWidth: 0
  },
  offersPageListContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    width: '100%',
    minWidth: 0
  },
  offersPageHeader: {
    paddingBottom: spacing.md,
    gap: spacing.md
  },
  offersPageTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm
  },
  offersPageBackButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardDeep,
    borderWidth: 1,
    borderColor: colors.line
  },
  offersPageBackButtonPressed: {
    opacity: 0.72
  },
  offersPageTitleCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2
  },
  offersPageTitle: {
    fontFamily: fonts.displaySoft,
    fontSize: 25,
    color: colors.ink
  },
  offersPageSubtitle: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.muted
  },
  offersPageCountBadge: {
    minWidth: 34,
    height: 34,
    paddingHorizontal: spacing.sm,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentWarm
  },
  offersPageCountText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 14,
    color: colors.white
  },
  offersPageFilterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs
  },
  offersPageFilterChip: {
    minHeight: 34,
    paddingHorizontal: spacing.md,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.cardDeep,
    justifyContent: 'center'
  },
  offersPageFilterChipActive: {
    backgroundColor: colors.accentWarm,
    borderColor: colors.accentWarm
  },
  offersPageFilterText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 13,
    color: colors.ink
  },
  offersPageFilterTextActive: {
    color: colors.white
  },
  listSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs
  },
  listSectionHeaderOffers: {
    marginTop: spacing.xs,
    marginBottom: spacing.xs
  },
  listSectionHeaderMenu: {
    marginTop: spacing.md,
    marginBottom: spacing.xs
  },
  listSectionIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center'
  },
  listSectionIconWrapOffers: {
    backgroundColor: colors.accentWarm
  },
  listSectionIconWrapMenu: {
    backgroundColor: colors.accentSoft
  },
  listSectionTitle: {
    fontFamily: fonts.displaySoft,
    fontSize: 18,
    letterSpacing: 0.2,
    color: colors.ink
  },
  listSectionTitleOffers: {
    color: colors.accentWarm
  },
  listSectionTitleMenu: {
    color: colors.ink
  },
  lunchNearbyFilterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
    marginBottom: spacing.sm
  },
  lunchNearbyFilterChip: {
    minHeight: 32,
    paddingHorizontal: spacing.sm,
    borderRadius: 999,
    backgroundColor: colors.cardDeep,
    borderWidth: 1,
    borderColor: colors.line,
    justifyContent: 'center'
  },
  lunchNearbyFilterChipContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5
  },
  lunchNearbyFilterChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  lunchNearbyFilterText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 12,
    color: colors.ink
  },
  lunchNearbyFilterTextActive: {
    color: colors.white
  },
  offersFilterBadge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentWarm
  },
  offersFilterBadgeText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 10,
    color: colors.white
  },
  heroWrap: {
    marginHorizontal: -spacing.lg,
    marginTop: -spacing.lg,
    marginBottom: spacing.md
  },
  previewHeroWrap: {
    marginTop: 0,
    marginBottom: spacing.sm
  },
  heroPanel: {
    overflow: 'visible',
    backgroundColor: colors.page
  },
  heroBackdrop: {
    minHeight: 124,
    position: 'relative',
    justifyContent: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingBottom: 44,
    backgroundColor: '#77ABFF'
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject
  },
  heroBrandRow: {
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
    position: 'relative',
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm
  },
  heroBrand: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs
  },
  heroBrandLogo: {
    width: 36,
    height: 36,
    flexShrink: 0,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.65)',
    backgroundColor: colors.white
  },
  heroBrandCopy: {
    flex: 1,
    minWidth: 0
  },
  heroHeading: {
    fontFamily: fonts.bodyStrong,
    fontSize: 19,
    lineHeight: 23,
    color: colors.white,
    textAlign: 'left'
  },
  menuButton: {
    minHeight: 34,
    flexShrink: 0,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 5
  },
  menuButtonPressed: {
    opacity: 0.82
  },
  menuButtonText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 13,
    color: colors.white
  },
  heroSubheading: {
    marginTop: 1,
    fontFamily: fonts.body,
    fontSize: 11,
    lineHeight: 14,
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'left'
  },
  heroControlsWrap: {
    width: '100%',
    zIndex: 4,
    alignItems: 'center',
    marginTop: -38,
    paddingHorizontal: spacing.lg
  },
  previewHeroControlsWrap: {
    marginTop: 0
  },
  heroControls: {
    width: '100%',
    maxWidth: 620,
    padding: spacing.sm,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    shadowColor: '#16324B',
    shadowOpacity: 0.13,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5
  },
  previewHeroControls: {
    padding: spacing.sm,
    borderRadius: radius.lg
  },
  previewCompactBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm
  },
  previewCompactBrandIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.page
  },
  previewCompactBrandCopy: {
    flex: 1,
    minWidth: 0
  },
  previewCompactBrandTitle: {
    fontFamily: fonts.bodyStrong,
    fontSize: 14,
    lineHeight: 18,
    color: colors.ink
  },
  previewCompactBrandSubtitle: {
    marginTop: 1,
    fontFamily: fonts.body,
    fontSize: 11,
    lineHeight: 14,
    color: colors.muted
  },
  mealSwitcher: {
    flexDirection: 'row',
    backgroundColor: colors.page,
    borderRadius: 999,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.line
  },
  mealSwitcherButton: {
    flex: 1,
    minWidth: 0,
    borderRadius: 999,
    minHeight: 34,
    paddingHorizontal: 3,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4
  },
  mealSwitcherButtonActive: {
    backgroundColor: colors.white,
    shadowColor: '#16324B',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2
  },
  mealSwitcherText: {
    flexShrink: 1,
    fontFamily: fonts.bodyStrong,
    fontSize: 11,
    color: colors.muted
  },
  mealSwitcherTextActive: {
    color: colors.accent
  },
  previewServiceSwitcher: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    gap: 7
  },
  previewServiceButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 7
  },
  previewServiceButtonActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  previewServiceText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 10,
    color: colors.ink
  },
  previewServiceTextActive: {
    color: colors.white
  },
  previewMapSearchButton: {
    minHeight: 42,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4
  },
  previewMapSearchText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 11,
    color: colors.ink
  },
  inputRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    alignItems: 'center',
    marginTop: spacing.sm
  },
  inputWrap: {
    flex: 1,
    minWidth: 0,
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.page
  },
  input: {
    flex: 1,
    minWidth: 0,
    fontFamily: fonts.body,
    fontSize: 14,
    paddingVertical: 0
  },
  button: {
    backgroundColor: colors.accentSoft,
    minHeight: 42,
    flexShrink: 0,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5
  },
  searchButtonPressed: {
    opacity: 0.84,
    transform: [{ scale: 0.98 }]
  },
  buttonText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 12,
    color: colors.ink
  },
  filterRow: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs
  },
  filterOpenButton: {
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    backgroundColor: colors.page,
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs
  },
  filterOpenButtonActive: {
    backgroundColor: colors.accentCool,
    borderColor: colors.accentCool
  },
  filterOpenText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 11,
    color: colors.ink
  },
  filterOpenTextActive: {
    color: colors.white
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)'
  },
  chipGoldActive: {
    backgroundColor: colors.accentSoft
  },
  chipGreenActive: {
    backgroundColor: colors.accentCool
  },
  chipActive: {
    borderColor: colors.ink
  },
  chipText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 13,
    color: colors.ink
  },
  chipTextLight: {
    color: colors.white
  },
  status: {
    flex: 1,
    minWidth: 0,
    fontFamily: fonts.body,
    fontSize: 10,
    lineHeight: 14,
    color: colors.muted,
    textAlign: 'right'
  },
  statusRestaurantCount: {
    fontFamily: fonts.bodyStrong,
    fontSize: 12,
    color: colors.accentCool
  },
  emptyCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.line
  },
  emptyTitle: {
    fontFamily: fonts.displaySoft,
    fontSize: 18,
    color: colors.ink
  },
  emptyText: {
    fontFamily: fonts.body,
    color: colors.muted,
    marginTop: spacing.xs
  },
  offerPressable: {
    transform: [{ scale: 1 }]
  },
  offerPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.92
  },
  footerMiniNav: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: 0,
    zIndex: 5,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16
  },
  footerMiniButton: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 4,
    paddingVertical: 6,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3
  },
  footerMiniButtonActive: {
    backgroundColor: colors.accentCool
  },
  footerMiniLabel: {
    fontFamily: fonts.bodyStrong,
    fontSize: 11,
    color: colors.ink,
    flexShrink: 1
  },
  footerMiniLabelActive: {
    color: colors.white
  },
  footerMiniPressed: {
    opacity: 0.8
  },
  mapTabWrap: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg
  },
  previewMapListButton: {
    position: 'absolute',
    zIndex: 20,
    top: 14,
    right: 14,
    minHeight: 38,
    borderRadius: 19,
    paddingHorizontal: 13,
    backgroundColor: colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    ...shadow
  },
  previewMapListText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 11,
    color: colors.ink
  },
  iosMapTabWrap: {
    paddingHorizontal: 0,
    paddingTop: 0
  },
  mapCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    overflow: 'hidden'
  },
  iosMapCard: {
    borderWidth: 0,
    borderRadius: 0,
    padding: 0,
    backgroundColor: colors.page
  },
  mapHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.sm
  },
  mapTitle: {
    fontFamily: fonts.displaySoft,
    fontSize: 20,
    color: colors.ink
  },
  mapCount: {
    minWidth: 30,
    textAlign: 'center',
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    backgroundColor: 'rgba(61,159,121,0.15)',
    color: colors.ink,
    fontFamily: fonts.bodyStrong,
    fontSize: 12
  },
  iosMapHeaderOverlay: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    right: spacing.md,
    zIndex: 5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.94)',
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 }
  },
  mapEmptyState: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.page,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    gap: spacing.xs
  },
  mapEmptyTitle: {
    marginTop: spacing.xs,
    fontFamily: fonts.bodyStrong,
    fontSize: 16,
    color: colors.ink,
    textAlign: 'center'
  },
  mapEmptyText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center'
  },
  mapHint: {
    marginTop: spacing.sm,
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted
  },
  iosMapHintOverlay: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md,
    zIndex: 5,
    alignItems: 'center'
  },
  iosMapHintText: {
    overflow: 'hidden',
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.92)',
    color: colors.muted,
    fontFamily: fonts.bodyStrong,
    fontSize: 12,
    textAlign: 'center'
  },
  cateringPlaceholderWrap: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl
  },
  cateringPlaceholderCard: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm
  },
  cateringPlaceholderTitle: {
    fontFamily: fonts.displaySoft,
    fontSize: 20,
    color: colors.ink
  },
  cateringPlaceholderText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center'
  },
  eventsListContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg
  },
  eventsHeader: {
    marginHorizontal: -spacing.lg,
    marginTop: -spacing.lg,
    marginBottom: spacing.md
  },
  previewEventsHeader: {
    marginTop: 0,
    marginBottom: spacing.sm
  },
  eventsHero: {
    minHeight: 124,
    position: 'relative',
    paddingHorizontal: spacing.lg,
    paddingBottom: 44,
    backgroundColor: '#7258D8',
    overflow: 'hidden'
  },
  eventsHeroOverlay: {
    ...StyleSheet.absoluteFillObject
  },
  eventsBrandRow: {
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
    position: 'relative',
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm
  },
  eventsBrand: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs
  },
  eventsBrandLogo: {
    width: 36,
    height: 36,
    flexShrink: 0,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.65)',
    backgroundColor: colors.white
  },
  eventsBrandCopy: {
    flex: 1,
    minWidth: 0
  },
  eventsEyebrow: {
    fontFamily: fonts.bodyStrong,
    fontSize: 12,
    color: 'rgba(255,255,255,0.72)',
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },
  eventsTitle: {
    flex: 1,
    minWidth: 0,
    fontFamily: fonts.bodyStrong,
    fontSize: 19,
    lineHeight: 23,
    color: colors.white,
    textAlign: 'left'
  },
  eventsSubtitle: {
    marginTop: 1,
    fontFamily: fonts.body,
    fontSize: 11,
    lineHeight: 14,
    color: 'rgba(255,255,255,0.9)'
  },
  eventsCountPill: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.42)'
  },
  eventsCountText: {
    fontFamily: fonts.bodyStrong,
    color: colors.white
  },
  eventsFilterCardWrap: {
    width: '100%',
    zIndex: 4,
    alignItems: 'center',
    marginTop: -38,
    paddingHorizontal: spacing.lg
  },
  previewEventsFilterCardWrap: {
    marginTop: 0
  },
  eventsFilterCard: {
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
    borderRadius: radius.lg,
    padding: spacing.sm,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 7,
    shadowColor: '#16324B',
    shadowOpacity: 0.13,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5
  },
  previewEventsFilterCard: {
    padding: spacing.sm,
    gap: spacing.xs
  },
  eventsFilterLabel: {
    fontFamily: fonts.bodyStrong,
    fontSize: 12,
    color: colors.muted,
    textTransform: 'uppercase'
  },
  eventsSearchRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8
  },
  eventsLocationInputWrap: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingLeft: spacing.md,
    paddingRight: 8,
    backgroundColor: colors.page,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  eventsSearchButton: {
    minWidth: 96,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6
  },
  eventsSearchButtonDisabled: {
    backgroundColor: colors.line
  },
  eventsSearchButtonPressed: {
    opacity: 0.86
  },
  eventsSearchButtonText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 13,
    color: colors.white
  },
  eventsLocationInput: {
    flex: 1,
    minWidth: 0,
    fontFamily: fonts.bodyStrong,
    fontSize: 14,
    color: colors.ink,
    paddingVertical: 0
  },
  eventsLocationClearButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center'
  },
  eventsRadiusRow: {
    flexDirection: 'row',
    gap: 7
  },
  restaurantRadiusRow: {
    marginTop: spacing.sm
  },
  eventsRadiusChip: {
    flex: 1,
    minWidth: 0,
    minHeight: 32,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.page,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6
  },
  eventsRadiusChipActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accent
  },
  eventsRadiusChipText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 12,
    color: colors.ink
  },
  eventsRadiusChipTextActive: {
    color: colors.white
  },
  eventsSearchStatus: {
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 17,
    color: colors.muted,
    paddingHorizontal: 2
  },
  eventsCompactFilterRow: {
    flexDirection: 'row',
    gap: 8
  },
  eventsCompactFilterButton: {
    flex: 1,
    minWidth: 0,
    minHeight: 50,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.page,
    flexDirection: 'row',
    alignItems: 'stretch',
    overflow: 'hidden'
  },
  eventsCompactFilterMain: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 10,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7
  },
  eventsCompactFilterTextWrap: {
    flex: 1,
    minWidth: 0
  },
  eventsCompactFilterLabel: {
    fontFamily: fonts.bodyStrong,
    fontSize: 12,
    color: colors.ink
  },
  eventsCompactFilterValue: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: colors.muted,
    marginTop: 1
  },
  eventsCompactClearButton: {
    width: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 1,
    borderLeftColor: colors.line
  },
  eventsCompactFilterChevron: {
    flexShrink: 0
  },
  eventDatePickerBackdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: 'rgba(15,23,42,0.48)'
  },
  eventDatePickerModalCard: {
    borderRadius: radius.xl,
    padding: spacing.lg,
    backgroundColor: colors.white,
    gap: spacing.md
  },
  eventDatePickerModalTitle: {
    fontFamily: fonts.displaySoft,
    fontSize: 22,
    color: colors.ink
  },
  eventDatePickerSpinner: {
    alignSelf: 'stretch'
  },
  eventDatePickerModalActions: {
    flexDirection: 'row',
    gap: spacing.sm
  },
  eventDatePickerOutlineAction: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center'
  },
  eventDatePickerOutlineActionText: {
    fontFamily: fonts.bodyStrong,
    color: colors.accent
  },
  eventDatePickerPrimaryAction: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center'
  },
  eventDatePickerPrimaryActionText: {
    fontFamily: fonts.bodyStrong,
    color: colors.white
  },
  eventsFilterToggle: {
    minHeight: 54,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.page,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    overflow: 'hidden'
  },
  eventsFilterToggleText: {
    flex: 1,
    minWidth: 0
  },
  eventsFilterQuestion: {
    fontFamily: fonts.displaySoft,
    fontSize: 18,
    color: colors.ink
  },
  eventsFilterChevron: {
    flexShrink: 0
  },
  eventsFilterHint: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted,
    marginTop: 2
  },
  eventsTagFilterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  eventsTagFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
    backgroundColor: colors.page,
    borderWidth: 1,
    borderColor: colors.line
  },
  eventsTagFilterChipActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink
  },
  eventsTagFilterText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 12,
    color: colors.ink
  },
  eventsTagFilterTextActive: {
    color: colors.white
  },
  eventsTagClearChip: {
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accentSoft
  },
  eventsTagClearText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 12,
    color: colors.ink
  },
  eventFollowModalWrap: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg
  },
  eventFollowModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.48)'
  },
  eventFollowModalCard: {
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
    backgroundColor: colors.white,
    ...shadow
  },
  eventFollowIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF4CC'
  },
  eventFollowTitle: {
    fontFamily: fonts.displaySoft,
    fontSize: 23,
    color: colors.ink
  },
  eventFollowText: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22,
    color: colors.muted
  },
  eventFollowActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs
  },
  eventFollowPrimaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent
  },
  eventFollowPrimaryText: {
    fontFamily: fonts.bodyStrong,
    color: colors.white
  },
  eventFollowSecondaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white
  },
  eventFollowSecondaryText: {
    fontFamily: fonts.bodyStrong,
    color: colors.ink
  },
  eventFollowButtonDisabled: {
    opacity: 0.58
  },
  eventFollowToast: {
    position: 'absolute',
    zIndex: 30,
    left: spacing.lg,
    right: spacing.lg,
    minHeight: 50,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.ink,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    ...shadow
  },
  eventFollowToastText: {
    flex: 1,
    fontFamily: fonts.bodyStrong,
    fontSize: 13,
    lineHeight: 19,
    color: colors.white
  },
  eventModalWrap: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg
  },
  eventModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.48)'
  },
  eventModalCard: {
    maxHeight: '86%',
    borderRadius: radius.xl,
    backgroundColor: colors.white,
    overflow: 'hidden'
  },
  eventModalContent: {
    padding: spacing.lg,
    gap: spacing.md
  },
  eventModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  eventModalHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  eventModalIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.ink
  },
  eventModalClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.page
  },
  eventModalTitle: {
    fontFamily: fonts.displaySoft,
    fontSize: 26,
    color: colors.ink
  },
  eventModalProvider: {
    fontFamily: fonts.bodyStrong,
    fontSize: 15,
    color: colors.accent
  },
  eventCancelledNotice: {
    borderWidth: 1,
    borderColor: 'rgba(249, 115, 22, 0.38)',
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: 'rgba(249, 115, 22, 0.10)',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm
  },
  eventCancelledNoticeTextWrap: {
    flex: 1,
    gap: 3
  },
  eventCancelledNoticeTitle: {
    fontFamily: fonts.bodyStrong,
    fontSize: 14,
    color: colors.accentWarm
  },
  eventCancelledNoticeText: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
    color: colors.ink
  },
  eventModalImageButton: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.page
  },
  eventModalImage: {
    width: '100%',
    height: 210
  },
  eventModalMetaGrid: {
    gap: 8
  },
  eventModalMetaItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8
  },
  eventModalMetaText: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.muted
  },
  eventModalTagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  eventModalTag: {
    overflow: 'hidden',
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    backgroundColor: colors.page,
    fontFamily: fonts.bodyStrong,
    fontSize: 12,
    color: colors.ink
  },
  eventModalDescription: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22,
    color: colors.ink
  },
  eventProviderCard: {
    borderRadius: radius.lg,
    padding: spacing.md,
    backgroundColor: colors.page,
    gap: 6
  },
  eventProviderSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm
  },
  eventProviderSummaryText: {
    flex: 1,
    minWidth: 0,
    gap: 2
  },
  eventProviderTitle: {
    fontFamily: fonts.bodyStrong,
    fontSize: 12,
    color: colors.muted,
    textTransform: 'uppercase'
  },
  eventProviderName: {
    fontFamily: fonts.displaySoft,
    fontSize: 18,
    color: colors.ink
  },
  eventProviderAbout: {
    marginTop: 4,
    gap: 2
  },
  eventProviderAboutLabel: {
    fontFamily: fonts.bodyStrong,
    fontSize: 12,
    color: colors.muted
  },
  eventProviderText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.muted
  },
  eventProviderContact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 4
  },
  eventProviderContactText: {
    fontFamily: fonts.bodyStrong,
    color: colors.ink
  },
  eventActionRow: {
    gap: spacing.sm
  },
  eventActionButton: {
    minHeight: 46,
    borderRadius: radius.md,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8
  },
  eventActionButtonText: {
    fontFamily: fonts.bodyStrong,
    color: colors.white
  },
  eventActionButtonSecondary: {
    minHeight: 44,
    borderRadius: radius.md,
    backgroundColor: colors.page,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8
  },
  eventActionSecondaryText: {
    fontFamily: fonts.bodyStrong,
    color: colors.ink
  },
  eventSocialPublicSection: {
    borderRadius: radius.lg,
    padding: spacing.md,
    backgroundColor: colors.page,
    gap: spacing.sm
  },
  eventSocialPublicRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  eventSocialPublicButton: {
    minHeight: 40,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    backgroundColor: colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7
  },
  eventSocialPublicText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 12,
    color: colors.ink
  },
  eventImagePreviewWrap: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.md
  },
  eventImagePreviewBackdrop: {
    ...StyleSheet.absoluteFillObject
  },
  eventImagePreviewCard: {
    width: '100%',
    height: '82%',
    borderRadius: radius.xl,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center'
  },
  eventImagePreviewClose: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    zIndex: 2,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  eventImagePreviewImage: {
    width: '100%',
    height: '100%'
  },
  menuModalWrap: {
    flex: 1
  },
  menuBackdrop: {
    ...StyleSheet.absoluteFillObject
  },
  menuBackdropFill: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)'
  },
  sideMenuPanel: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: '82%',
    maxWidth: 360,
    backgroundColor: colors.card,
    borderLeftWidth: 1,
    borderLeftColor: colors.line,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg
  },
  sideMenuHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm
  },
  sideMenuBrandRow: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1
  },
  sideMenuBrandLogo: {
    width: 86,
    height: 86,
    borderRadius: 8
  },
  sideMenuBrandText: {
    fontFamily: fonts.displaySoft,
    fontSize: 17,
    color: colors.ink,
    textAlign: 'center'
  },
  sideMenuClose: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.05)'
  },
  sideMenuHeading: {
    fontFamily: fonts.bodyStrong,
    marginTop: spacing.lg,
    fontSize: 14,
    color: colors.ink
  },
  sideMenuSocialRow: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm
  },
  sideMenuSocialChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(0, 188, 212, 0.12)',
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: 8
  },
  sideMenuSocialChipPressed: {
    opacity: 0.82
  },
  sideMenuSocialText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 12,
    color: colors.ink
  },
  sideMenuContactRow: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs
  },
  sideMenuText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ink
  },
  sideMenuBottom: {
    marginTop: 'auto',
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: spacing.sm
  },
  sideMenuRegisterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: 999,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.md,
    paddingVertical: 10
  },
  sideMenuRegisterButtonPressed: {
    opacity: 0.9
  },
  sideMenuRegisterButtonText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 14,
    color: colors.white
  },
  sideMenuLegalLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    paddingVertical: 10
  },
  sideMenuLegalPressed: {
    opacity: 0.82
  },
  sideMenuLegalText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 14,
    color: colors.ink
  },
  filterModalWrap: {
    flex: 1,
    justifyContent: 'flex-end'
  },
  filterModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)'
  },
  filterModalCard: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.line
  },
  filterModalTitle: {
    fontFamily: fonts.displaySoft,
    fontSize: 20,
    color: colors.ink
  },
  filterModalLabel: {
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    fontFamily: fonts.bodyStrong,
    color: colors.muted
  },
  filterOptionsRow: {
    gap: spacing.sm
  },
  filterOpeningStatusRow: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs
  },
  filterOpeningHint: {
    marginTop: spacing.sm,
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 17,
    color: colors.muted
  },
  filterChoice: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    backgroundColor: colors.card
  },
  filterChoiceActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  filterChoiceText: {
    fontFamily: fonts.bodyStrong,
    color: colors.ink
  },
  filterChoiceTextActive: {
    color: colors.white
  },
  filterCuisineWrap: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs
  },
  filterCuisineChip: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
    backgroundColor: colors.card
  },
  filterCuisineChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  filterCuisineChipText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 12,
    color: colors.ink
  },
  filterCuisineChipTextActive: {
    color: colors.white
  },
  filterActionRow: {
    marginTop: spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm
  },
  filterResetButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: colors.card
  },
  filterResetText: {
    fontFamily: fonts.bodyStrong,
    color: colors.ink
  },
  filterApplyButton: {
    flex: 1,
    borderRadius: radius.md,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: colors.accent
  },
  filterApplyText: {
    fontFamily: fonts.bodyStrong,
    color: colors.white
  },
  offerModalOverlay: {
    flex: 1,
    padding: spacing.sm
  },
  offerModalBackdrop: {
    ...StyleSheet.absoluteFillObject
  },
  modalBackdropFill: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)'
  },
  offerModalCard: {
    flex: 1,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line
  },
  offerModalCardSimpleInfo: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    overflow: 'visible'
  },
  offerModalScroll: {
    flex: 1
  },
  offerModalScrollContent: {
    paddingBottom: spacing.md
  },
  offerHero: {
    minHeight: 248,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xl
  },
  offerHeroTopRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center'
  },
  offerHeroIconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.18)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  offerHeroImageRing: {
    width: 196,
    height: 196,
    borderRadius: 98,
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.9)',
    backgroundColor: '#0f172a',
    overflow: 'hidden',
    alignSelf: 'center',
    marginTop: spacing.lg,
    marginBottom: -98
  },
  offerHeroImage: {
    width: '100%',
    height: '100%'
  },
  offerHeroPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  offerHeroPlaceholderText: {
    fontFamily: fonts.display,
    fontSize: 64,
    color: colors.white
  },
  offerCompactHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 8,
    height: 70,
    backgroundColor: 'rgba(248,248,248,0.98)',
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm
  },
  offerCompactBackButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.07)'
  },
  offerCompactThumb: {
    width: 32,
    height: 32,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center'
  },
  offerCompactThumbImage: {
    width: '100%',
    height: '100%'
  },
  offerCompactThumbInitial: {
    fontFamily: fonts.bodyStrong,
    color: colors.white,
    fontSize: 15
  },
  offerCompactTitle: {
    flex: 1,
    fontFamily: fonts.bodyStrong,
    fontSize: 15,
    color: colors.ink
  },
  offerDetailSheet: {
    backgroundColor: '#F8F8F8',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: 72
  },
  offerDetailSheetContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl
  },
  offerLeadText: {
    fontFamily: fonts.body,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 20
  },
  offerTitleRow: {
    marginTop: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: spacing.sm
  },
  offerTitleWrap: {
    flex: 1
  },
  offerTypeBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.accentWarm,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: spacing.xs
  },
  offerTypeBadgeText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 11,
    color: colors.white
  },
  offerModalTitle: {
    fontFamily: fonts.display,
    fontSize: 36,
    lineHeight: 40,
    color: colors.ink,
    textTransform: 'capitalize'
  },
  offerModalMeta: {
    fontFamily: fonts.bodyStrong,
    fontSize: 14,
    color: colors.muted,
    marginTop: 2
  },
  offerPortionText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 14,
    color: colors.ink,
    paddingBottom: 4
  },
  offerRestaurantCard: {
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    padding: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm
  },
  offerRestaurantCardPressed: {
    opacity: 0.85
  },
  offerRestaurantHint: {
    marginTop: spacing.xs,
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted
  },
  offerRestaurantLogo: {
    width: 40,
    height: 40,
    borderRadius: 8
  },
  offerRestaurantMain: {
    flex: 1,
    gap: 2
  },
  offerRestaurantName: {
    fontFamily: fonts.bodyStrong,
    fontSize: 16,
    color: colors.ink
  },
  offerRestaurantInfo: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.muted
  },
  offerStars: {
    flexDirection: 'row',
    gap: 2
  },
  restaurantInfoLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 12
  },
  restaurantInfoModalWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end'
  },
  restaurantInfoBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)'
  },
  restaurantInfoCard: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    maxHeight: '84%'
  },
  restaurantInfoHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm
  },
  restaurantInfoHeaderMain: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: spacing.sm
  },
  restaurantInfoLogo: {
    width: 44,
    height: 44,
    borderRadius: 10
  },
  restaurantInfoTextWrap: {
    flex: 1
  },
  restaurantInfoTitle: {
    fontFamily: fonts.bodyStrong,
    fontSize: 17,
    color: colors.ink
  },
  restaurantInfoSubtitle: {
    marginTop: 2,
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.muted
  },
  restaurantInfoCuisine: {
    marginTop: 2,
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted
  },
  restaurantInfoCloseButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.page
  },
  restaurantInfoScroll: {
    marginTop: spacing.sm
  },
  restaurantInfoScrollContent: {
    paddingBottom: spacing.sm
  },
  restaurantInfoRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs
  },
  restaurantInfoRatingCaption: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.muted
  },
  restaurantAboutCard: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm
  },
  restaurantAboutTitle: {
    fontFamily: fonts.bodyStrong,
    fontSize: 14,
    color: colors.ink,
    marginBottom: spacing.xs
  },
  restaurantAboutText: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 21,
    color: colors.ink
  },
  restaurantAboutMoreButton: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  restaurantAboutMoreText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 12,
    color: colors.accent
  },
  restaurantSocialCard: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm
  },
  restaurantSocialRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs
  },
  restaurantSocialChip: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
    backgroundColor: colors.page,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5
  },
  restaurantSocialChipText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 12,
    color: colors.ink
  },
  ratingSection: {
    marginTop: spacing.sm,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.sm
  },
  restaurantRatingSection: {
    marginTop: spacing.md
  },
  ratingTitle: {
    fontFamily: fonts.bodyStrong,
    fontSize: 15,
    color: colors.ink
  },
  ratingStarsRow: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    gap: spacing.xs
  },
  ratingStarButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center'
  },
  ratingInput: {
    marginTop: spacing.sm,
    minHeight: 78,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 9,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ink,
    backgroundColor: colors.page
  },
  ratingSubmitButton: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    backgroundColor: colors.accent
  },
  ratingSubmitText: {
    fontFamily: fonts.bodyStrong,
    color: colors.white,
    fontSize: 13
  },
  ratingError: {
    marginTop: spacing.xs,
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.accentWarm
  },
  ratingSuccess: {
    marginTop: spacing.xs,
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.accentCool
  },
  reviewSectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm
  },
  reviewSectionHeaderText: {
    flex: 1
  },
  reviewSectionSubtitle: {
    marginTop: 2,
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted
  },
  reviewWriteButton: {
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    backgroundColor: colors.ink,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5
  },
  reviewWriteButtonText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 12,
    color: colors.white
  },
  reviewList: {
    marginTop: spacing.sm,
    gap: spacing.sm
  },
  reviewCard: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    padding: spacing.sm
  },
  reviewCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm
  },
  reviewAuthorBlock: {
    flex: 1,
    gap: 3
  },
  reviewAuthor: {
    fontFamily: fonts.bodyStrong,
    fontSize: 13,
    color: colors.ink
  },
  reviewDate: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted
  },
  reviewText: {
    marginTop: spacing.xs,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.ink
  },
  reviewImageScroll: {
    marginTop: spacing.sm
  },
  reviewImageRow: {
    flexDirection: 'row',
    gap: spacing.xs
  },
  reviewImage: {
    width: 92,
    height: 92,
    borderRadius: radius.md,
    backgroundColor: colors.line
  },
  reviewReplyBox: {
    marginTop: spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    borderRadius: radius.sm,
    backgroundColor: colors.white,
    padding: spacing.sm
  },
  reviewReplyLabel: {
    fontFamily: fonts.bodyStrong,
    fontSize: 12,
    color: colors.accent
  },
  reviewReplyText: {
    marginTop: 3,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
    color: colors.ink
  },
  reviewEmptyText: {
    marginTop: spacing.sm,
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.muted
  },
  reviewComposerLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 40,
    elevation: 40,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg
  },
  reviewComposerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.56)'
  },
  reviewComposerCard: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '92%',
    zIndex: 1,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    padding: spacing.lg,
    shadowColor: '#0F172A',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 16 },
    elevation: 10
  },
  reviewComposerHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm
  },
  reviewComposerEyebrow: {
    fontFamily: fonts.bodyStrong,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: colors.accent
  },
  reviewComposerTitle: {
    marginTop: 2,
    fontFamily: fonts.bodyStrong,
    fontSize: 20,
    color: colors.ink
  },
  reviewComposerStars: {
    marginTop: spacing.md,
    flexDirection: 'row',
    gap: spacing.xs
  },
  reviewComposerInput: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ink,
    backgroundColor: colors.page
  },
  reviewComposerTextArea: {
    minHeight: 108
  },
  reviewComposerImageBar: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  reviewImagePickerButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  reviewImagePickerText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 12,
    color: colors.ink
  },
  reviewPickedImageScroll: {
    marginTop: spacing.sm
  },
  reviewPickedImageWrap: {
    position: 'relative'
  },
  reviewPickedImage: {
    width: 78,
    height: 78,
    borderRadius: radius.md,
    backgroundColor: colors.line
  },
  reviewPickedImageRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.ink
  },
  reviewSubmitButton: {
    marginTop: spacing.md,
    borderRadius: 999,
    backgroundColor: colors.accent,
    paddingVertical: 12,
    alignItems: 'center'
  },
  reviewSubmitButtonDisabled: {
    opacity: 0.58
  },
  reviewSubmitButtonText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 14,
    color: colors.white
  },
  offerContactRow: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs
  },
  offerContactRowDisabled: {
    opacity: 0.62
  },
  offerContactText: {
    fontFamily: fonts.body,
    color: colors.ink,
    flex: 1
  },
  openingHoursCard: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    gap: spacing.xs
  },
  openingHoursHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs
  },
  openingHoursTitle: {
    fontFamily: fonts.bodyStrong,
    fontSize: 14,
    color: colors.ink
  },
  openingHoursRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm
  },
  openingHoursDay: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.muted,
    flex: 1
  },
  openingHoursRange: {
    fontFamily: fonts.bodyStrong,
    fontSize: 13,
    color: colors.ink
  },
  openingHoursFallback: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.muted
  },
  specialClosurePublicList: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    gap: spacing.xs
  },
  specialClosurePublicTitle: {
    fontFamily: fonts.bodyStrong,
    fontSize: 13,
    color: colors.ink
  },
  specialClosurePublicRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm
  },
  specialClosurePublicDate: {
    flexShrink: 0,
    fontFamily: fonts.bodyStrong,
    fontSize: 12,
    color: colors.accentWarm
  },
  specialClosurePublicReason: {
    flex: 1,
    textAlign: 'right',
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted
  },
  restaurantMenuButton: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs
  },
  restaurantMenuButtonDisabled: {
    backgroundColor: colors.page,
    borderWidth: 1,
    borderColor: colors.line
  },
  restaurantMenuButtonText: {
    fontFamily: fonts.bodyStrong,
    color: colors.white
  },
  restaurantMenuButtonTextDisabled: {
    color: colors.muted
  },
  restaurantMenuButtonAlt: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    backgroundColor: colors.accentSoft,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs
  },
  restaurantMenuButtonAltText: {
    fontFamily: fonts.bodyStrong,
    color: colors.ink
  },
  restaurantMenuChoiceRow: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs
  },
  restaurantMenuChoiceButton: {
    alignSelf: 'flex-start',
    backgroundColor: colors.cardDeep,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs
  },
  restaurantMenuChoiceText: {
    fontFamily: fonts.bodyStrong,
    color: colors.ink
  },
  publicMenuList: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    overflow: 'hidden'
  },
  publicMenuFilterRow: {
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    backgroundColor: colors.cardDeep
  },
  publicMenuCategoryBlock: {
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    backgroundColor: colors.white
  },
  publicMenuCategoryBlockLast: {
    borderBottomWidth: 0
  },
  publicMenuCategoryTitle: {
    fontFamily: fonts.bodyStrong,
    color: colors.ink,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.line
  },
  publicMenuCategoryTitleToneDefault: {
    backgroundColor: colors.cardDeep
  },
  publicMenuCategoryTitleToneLunch: {
    backgroundColor: 'rgba(0, 188, 212, 0.18)'
  },
  publicMenuCategoryTitleToneDinner: {
    backgroundColor: 'rgba(249, 115, 22, 0.16)'
  },
  publicMenuCategoryTitleToneBreakfast: {
    backgroundColor: 'rgba(255, 213, 79, 0.38)'
  },
  publicMenuCategoryTitleToneKids: {
    backgroundColor: 'rgba(167, 139, 250, 0.20)'
  },
  publicMenuCategoryTitleToneDessert: {
    backgroundColor: 'rgba(244, 114, 182, 0.18)'
  },
  publicMenuCategoryTitleToneSalad: {
    backgroundColor: 'rgba(34, 197, 94, 0.18)'
  },
  publicMenuRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.line
  },
  publicMenuRowPressed: {
    backgroundColor: colors.cardDeep
  },
  menuItemDetailLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 45,
    elevation: 45,
    justifyContent: 'center',
    padding: spacing.lg
  },
  menuItemDetailBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.42)'
  },
  menuItemDetailCard: {
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
    borderRadius: radius.xl,
    padding: spacing.lg,
    backgroundColor: colors.white,
    gap: spacing.sm
  },
  menuItemDetailHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm
  },
  menuItemDetailTitleWrap: {
    flex: 1,
    gap: 4
  },
  menuItemDetailTitle: {
    fontFamily: fonts.heading,
    fontSize: 21,
    lineHeight: 27,
    color: colors.ink
  },
  menuItemDetailPrice: {
    fontFamily: fonts.bodyStrong,
    fontSize: 17,
    color: colors.accentCool
  },
  menuItemDetailDescription: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22,
    color: colors.ink
  },
  menuItemDetailSchedule: {
    fontFamily: fonts.bodyStrong,
    fontSize: 13,
    color: colors.accentCool
  },
  menuItemDetailAllergens: {
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.line
  },
  menuItemDetailAllergenText: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
    color: colors.muted
  },
  menuItemDetailActions: {
    marginTop: spacing.xs,
    gap: spacing.sm
  },
  menuItemDetailCallButton: {
    minHeight: 46,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.md
  },
  menuItemDetailCallText: {
    fontFamily: fonts.bodyStrong,
    color: colors.white
  },
  menuItemDetailPreorderButton: {
    minHeight: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.md
  },
  menuItemDetailPreorderText: {
    fontFamily: fonts.bodyStrong,
    color: colors.accent
  },
  menuItemDetailActionDisabled: {
    opacity: 0.45
  },
  publicMenuHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm
  },
  publicMenuNameRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs
  },
  publicMenuName: {
    flex: 1,
    fontFamily: fonts.bodyStrong,
    color: colors.ink
  },
  publicMenuDietBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3
  },
  publicMenuDietBadgeVegan: {
    backgroundColor: 'rgba(34, 197, 94, 0.18)'
  },
  publicMenuDietBadgeVegetarian: {
    backgroundColor: 'rgba(255, 213, 79, 0.38)'
  },
  publicMenuDietBadgeDrinks: {
    backgroundColor: 'rgba(14, 165, 233, 0.18)'
  },
  publicMenuDietBadgeText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 11,
    color: colors.ink
  },
  publicMenuPrice: {
    fontFamily: fonts.bodyStrong,
    color: colors.accentCool
  },
  publicMenuDescription: {
    marginTop: 2,
    fontFamily: fonts.body,
    color: colors.muted,
    fontSize: 13
  },
  publicMenuSchedule: {
    marginTop: 2,
    fontFamily: fonts.bodyStrong,
    color: colors.accentCool,
    fontSize: 12
  },
  publicMenuItemAllergenWrap: {
    marginTop: spacing.xs
  },
  publicMenuItemAllergenLabel: {
    fontFamily: fonts.bodyStrong,
    fontSize: 12,
    color: colors.muted,
    marginBottom: 4
  },
  publicMenuItemAllergenRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs
  },
  publicMenuItemAllergenChip: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    backgroundColor: colors.cardDeep,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3
  },
  publicMenuItemAllergenChipText: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.ink
  },
  publicMenuMeta: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted
  },
  publicMenuAllergenSection: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    backgroundColor: colors.white
  },
  publicMenuAllergenTitle: {
    fontFamily: fonts.bodyStrong,
    color: colors.ink,
    marginBottom: spacing.xs
  },
  publicMenuAllergenRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs
  },
  publicMenuAllergenChip: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    backgroundColor: colors.cardDeep,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4
  },
  publicMenuAllergenChipText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.ink
  },
  publicMenuAllergenEmpty: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted
  },
  publicMenuEmptyFiltered: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.muted,
    backgroundColor: colors.white
  },
  offerPriceRow: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    gap: 2
  },
  offerPriceLabel: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.muted
  },
  offerModalPrice: {
    fontFamily: fonts.displaySoft,
    color: colors.ink,
    fontSize: 30
  },
  preorderButton: {
    marginTop: spacing.md,
    backgroundColor: '#3FAE83',
    borderRadius: 999,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm
  },
  preorderText: {
    fontFamily: fonts.bodyStrong,
    color: colors.white
  },
  preorderDisabled: {
    marginTop: spacing.md,
    fontFamily: fonts.body,
    color: colors.muted
  },
  actionPanelWrap: {
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    padding: spacing.sm
  },
  actionPanelToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm
  },
  actionPanelTitle: {
    fontFamily: fonts.bodyStrong,
    fontSize: 15,
    color: colors.ink
  },
  reservationExternalHint: {
    marginTop: spacing.sm,
    fontFamily: fonts.body,
    color: colors.muted,
    lineHeight: 20
  },
  reservationExternalActionList: {
    marginTop: spacing.sm,
    gap: spacing.sm
  },
  reservationExternalActionButton: {
    borderRadius: 999,
    backgroundColor: colors.accent,
    minHeight: 46,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm
  },
  reservationExternalActionText: {
    fontFamily: fonts.bodyStrong,
    color: colors.white,
    textAlign: 'center',
    flexShrink: 1
  },
  orderForm: {
    marginTop: spacing.md
  },
  orderTitle: {
    fontFamily: fonts.displaySoft,
    fontSize: 18,
    color: colors.ink,
    marginBottom: spacing.sm
  },
  orderInput: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontFamily: fonts.body,
    fontSize: 14,
    marginBottom: spacing.sm
  },
  orderRow: {
    flexDirection: 'row',
    gap: spacing.sm
  },
  orderInputSmall: {
    flex: 1
  },
  orderInputNoBottom: {
    marginBottom: 0
  },
  timePickerLabel: {
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    fontFamily: fonts.bodyStrong,
    fontSize: 13,
    color: colors.muted
  },
  timeScroll: {
    maxHeight: 42
  },
  timeScrollContent: {
    gap: spacing.xs,
    paddingHorizontal: spacing.sm
  },
  timeChip: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    minWidth: 64,
    paddingHorizontal: spacing.sm,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white
  },
  timeChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  timeChipDisabled: {
    backgroundColor: colors.cardDeep,
    borderColor: colors.line,
    opacity: 0.58
  },
  timeChipText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 12,
    color: colors.ink
  },
  timeChipTextDisabled: {
    color: colors.muted
  },
  timeChipTextActive: {
    color: colors.white
  },
  orderTypeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    marginBottom: spacing.sm
  },
  orderTypeChip: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 8,
    backgroundColor: colors.cardDeep,
    alignItems: 'center'
  },
  orderTypeActive: {
    backgroundColor: colors.accent
  },
  orderTypeText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 12,
    color: colors.ink
  },
  orderTypeTextActive: {
    color: colors.white
  },
  orderError: {
    fontFamily: fonts.body,
    color: colors.accentWarm,
    marginTop: spacing.xs
  },
  cateringProviderCard: {
    marginHorizontal: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: 'row',
    gap: spacing.md
  },
  cateringProviderCardPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.99 }]
  },
  cateringProviderLogo: {
    width: 68,
    height: 68,
    borderRadius: radius.md,
    backgroundColor: colors.cardDeep
  },
  cateringProviderLogoFallback: {
    width: 68,
    height: 68,
    borderRadius: radius.md,
    backgroundColor: colors.cardDeep,
    alignItems: 'center',
    justifyContent: 'center'
  },
  cateringProviderContent: {
    flex: 1,
    minWidth: 0,
    gap: 4
  },
  cateringProviderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs
  },
  cateringProviderName: {
    flex: 1,
    fontFamily: fonts.displaySoft,
    fontSize: 18,
    color: colors.ink
  },
  cateringProviderDescription: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.muted,
    lineHeight: 18
  },
  cateringProviderMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2
  },
  cateringProviderMeta: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.ink
  },
  cateringModalWrap: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(22, 31, 48, 0.36)'
  },
  cateringModalBackdrop: {
    ...StyleSheet.absoluteFillObject
  },
  cateringModalCard: {
    maxHeight: '82%',
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    backgroundColor: colors.white,
    overflow: 'hidden'
  },
  cateringModalContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.md
  },
  cateringModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  cateringModalLogo: {
    width: 62,
    height: 62,
    borderRadius: radius.md,
    backgroundColor: colors.cardDeep
  },
  cateringModalLogoFallback: {
    width: 62,
    height: 62,
    borderRadius: radius.md,
    backgroundColor: colors.cardDeep,
    alignItems: 'center',
    justifyContent: 'center'
  },
  cateringModalClose: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.cardDeep,
    alignItems: 'center',
    justifyContent: 'center'
  },
  cateringModalTitle: {
    fontFamily: fonts.displaySoft,
    fontSize: 28,
    color: colors.ink
  },
  cateringModalLabel: {
    fontFamily: fonts.bodyStrong,
    fontSize: 13,
    color: colors.muted
  },
  cateringModalDescription: {
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 23,
    color: colors.ink
  },
  cateringPackagesSection: {
    gap: spacing.sm
  },
  cateringPackageCard: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.cardDeep
  },
  cateringPackageHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm
  },
  cateringPackageTitle: {
    flex: 1,
    fontFamily: fonts.bodyStrong,
    fontSize: 16,
    color: colors.ink
  },
  cateringPackagePrice: {
    fontFamily: fonts.bodyStrong,
    fontSize: 15,
    color: colors.accentCool
  },
  cateringPackageDescription: {
    marginTop: 5,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted
  },
  cateringPackageImageRow: {
    gap: spacing.xs,
    paddingTop: spacing.sm
  },
  cateringPackageImage: {
    width: 132,
    height: 96,
    borderRadius: radius.sm,
    backgroundColor: colors.white
  },
  cateringModalAddress: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.cardDeep
  },
  cateringModalAddressText: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ink
  },
  cateringModalActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm
  },
  cateringModalPrimaryAction: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs
  },
  cateringModalPrimaryActionText: {
    fontFamily: fonts.bodyStrong,
    color: colors.white
  },
  cateringModalSecondaryAction: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.cardDeep,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs
  },
  cateringModalSecondaryActionText: {
    fontFamily: fonts.bodyStrong,
    color: colors.ink
  },
  cateringSocialSection: {
    gap: spacing.sm
  },
  cateringSocialRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm
  },
  cateringSocialButton: {
    minHeight: 38,
    paddingHorizontal: spacing.sm,
    borderRadius: 999,
    backgroundColor: colors.cardDeep,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs
  },
  cateringSocialText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 12,
    color: colors.ink
  },
  orderSuccess: {
    fontFamily: fonts.body,
    color: colors.accentCool,
    marginTop: spacing.xs
  }
});

export default UserScreen;
