import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Image,
  Linking,
  Modal
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius, shadow, spacing } from '../theme/theme';
import { useOffers, formatPrice } from '../store/OffersContext';

const appIcon = require('../../assets/icon33.jpeg');
const DEFAULT_MEAL_SLOT = 'lunch';
const mealSlotOptions = [
  { key: 'breakfast', label: 'Frühstück' },
  { key: 'lunch', label: 'Mittagstisch' },
  { key: 'dinner', label: 'Abendessen' }
];
const cuisineTypeOptions = [
  'Schwäbisch',
  'Italienisch',
  'Indisch',
  'Asiatisch',
  'Bietet vegetarisch',
  'Bietet vegan',
  'Türkisch',
  'Arabisch',
  'Mediterran',
  'Deutsch',
  'Amerikanisch',
  'International'
];
const allMealSlots = mealSlotOptions.map((option) => option.key);
const mealSlotLabelByKey = mealSlotOptions.reduce((acc, option) => {
  acc[option.key] = option.label;
  return acc;
}, {});
const digitalCategories = ['Vegan', 'Vegetarisch', 'Normal'];
const emptyDigitalMenuDraft = {
  items: [],
  duplicatesRemoved: 0,
  warnings: [],
  updatedAt: null
};

const createDraftId = () => `menu-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

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

const normalizeDraftCategory = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized.includes('vegan')) return 'Vegan';
  if (normalized.includes('vegetar')) return 'Vegetarisch';
  return 'Normal';
};

const toPriceText = (value) => {
  const parsed = normalizePriceInput(value);
  return parsed === null ? '' : parsed.toFixed(2).replace('.', ',');
};

const normalizeDraftItem = (item) => {
  const name = String(item?.name || item?.title || '').trim();
  if (!name) return null;
  const parsedPrice = normalizePriceInput(item?.price ?? item?.priceText);
  if (parsedPrice === null) return null;
  return {
    id: String(item?.id || createDraftId()),
    name,
    description: String(item?.description || '').trim(),
    priceText: parsedPrice.toFixed(2).replace('.', ','),
    category: normalizeDraftCategory(item?.category)
  };
};

const buildDigitalMenuDraft = (payload) => {
  const directItemsSource = Array.isArray(payload?.menu?.items)
    ? payload.menu.items
    : Array.isArray(payload?.items)
    ? payload.items
    : null;

  if (directItemsSource) {
    return {
      items: directItemsSource.map(normalizeDraftItem).filter(Boolean),
      duplicatesRemoved: Number(payload?.duplicatesRemoved || 0),
      warnings: Array.isArray(payload?.warnings) ? payload.warnings.filter(Boolean) : [],
      updatedAt: payload?.updatedAt || null
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
        .map((item) => normalizeDraftItem(item))
        .filter(Boolean)
        .map((entry) => {
          if (entry.category !== 'Normal') return entry;
          return {
            ...entry,
            category: normalizeDraftCategory(sectionName)
          };
        });
    })
    .filter(Boolean);

  return {
    items,
    duplicatesRemoved: Number(payload?.duplicatesRemoved || 0),
    warnings: Array.isArray(payload?.warnings) ? payload.warnings.filter(Boolean) : [],
    updatedAt: payload?.updatedAt || null
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

const TagToggle = ({ label, active, onPress, tone }) => {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.tagToggle,
        active && styles.tagToggleActive,
        tone === 'gold' && styles.tagToggleGold,
        pressed && { opacity: 0.8 }
      ]}
    >
      <Text style={styles.tagToggleText}>{label}</Text>
    </Pressable>
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

const RestaurantScreen = ({ onBack }) => {
  const {
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
    logout
  } = useOffers();

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const [registerName, setRegisterName] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerPhone, setRegisterPhone] = useState('');
  const [registerAddress, setRegisterAddress] = useState('');
  const [registerPostal, setRegisterPostal] = useState('');

  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [offerMealSlot, setOfferMealSlot] = useState(DEFAULT_MEAL_SLOT);
  const [isVegan, setIsVegan] = useState(false);
  const [isVegetarian, setIsVegetarian] = useState(false);
  const [imageUri, setImageUri] = useState(null);
  const [imageAsset, setImageAsset] = useState(null);
  const [preorderEnabled, setPreorderEnabled] = useState(false);
  const [editingOffer, setEditingOffer] = useState(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileMealSlots, setProfileMealSlots] = useState([DEFAULT_MEAL_SLOT]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsMealSlots, setSettingsMealSlots] = useState([DEFAULT_MEAL_SLOT]);
  const [settingsTableReservationEnabled, setSettingsTableReservationEnabled] = useState(false);
  const [settingsCuisineTypes, setSettingsCuisineTypes] = useState([]);
  const [authMode, setAuthMode] = useState('login');
  const [status, setStatus] = useState('');
  const [digitalMenuDraft, setDigitalMenuDraft] = useState({ ...emptyDigitalMenuDraft });
  const [digitalMenuStatus, setDigitalMenuStatus] = useState('');
  const [digitalMenuError, setDigitalMenuError] = useState('');
  const [digitalMenuLoading, setDigitalMenuLoading] = useState(false);
  const [digitalMenuSaving, setDigitalMenuSaving] = useState(false);
  const [menuItemEditorOpen, setMenuItemEditorOpen] = useState(false);
  const [menuItemEditor, setMenuItemEditor] = useState({
    id: null,
    name: '',
    description: '',
    priceText: '',
    category: 'Normal'
  });
  const [menuItemOfferMealSlot, setMenuItemOfferMealSlot] = useState(DEFAULT_MEAL_SLOT);
  const [menuItemOfferPreorderEnabled, setMenuItemOfferPreorderEnabled] = useState(false);
  const [menuItemOfferPanelOpen, setMenuItemOfferPanelOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState({
    restaurantMenu: false,
    currentMenu: false,
    newOffer: false,
    myOffers: false
  });

  const headerSubtitle = useMemo(() => {
    if (restaurant) {
      return `Hallo ${restaurant.name}`;
    }
    return 'Als Restaurant anmelden oder neu registrieren.';
  }, [restaurant]);

  const normalizeMealSlots = (slots) => {
    const next = Array.from(
      new Set((slots || []).filter((slot) => mealSlotOptions.some((option) => option.key === slot)))
    );
    return next.length ? next : [DEFAULT_MEAL_SLOT];
  };

  const toggleMealSlot = (currentSlots, slot) => {
    if (currentSlots.includes(slot)) {
      if (currentSlots.length === 1) return currentSlots;
      return currentSlots.filter((value) => value !== slot);
    }
    return [...currentSlots, slot];
  };

  const normalizeCuisineTypes = (types) => {
    if (!Array.isArray(types)) return [];
    return Array.from(
      new Set(
        types
          .map((entry) => String(entry || '').trim())
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

  useEffect(() => {
    if (!restaurant) return;
    const restaurantSlots = normalizeMealSlots(restaurant.mealSlots);
    setProfileMealSlots(restaurantSlots);
    setSettingsMealSlots(restaurantSlots);
    setSettingsTableReservationEnabled(Boolean(restaurant.tableReservationEnabled));
    setSettingsCuisineTypes(normalizeCuisineTypes(restaurant.cuisineTypes));
    if (!restaurantSlots.includes(offerMealSlot)) {
      setOfferMealSlot(restaurantSlots[0]);
    }
  }, [restaurant]);

  useEffect(() => {
    if (!restaurant?.id) return;
    setPanelOpen({
      restaurantMenu: false,
      currentMenu: false,
      newOffer: false,
      myOffers: false
    });
  }, [restaurant?.id]);

  useEffect(() => {
    let active = true;

    const loadDigitalMenu = async () => {
      if (!restaurant) {
        setDigitalMenuDraft({ ...emptyDigitalMenuDraft });
        setDigitalMenuStatus('');
        setDigitalMenuError('');
        return;
      }

      try {
        const result = await getRestaurantDigitalMenu();
        if (!active) return;
        setDigitalMenuDraft(buildDigitalMenuDraft(result));
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
  }, [restaurant, getRestaurantDigitalMenu]);

  const handleLogin = async () => {
    setStatus('');
    if (!loginEmail.trim() || !loginPassword.trim()) {
      setStatus('Bitte E-Mail und Passwort eingeben.');
      return;
    }
    const ok = await login(loginEmail.trim(), loginPassword.trim());
    if (ok) {
      setStatus('Login erfolgreich.');
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
      !registerPostal.trim()
    ) {
      setStatus('Bitte alle Felder ausfüllen.');
      return;
    }

    const ok = await registerRestaurant({
      name: registerName.trim(),
      email: registerEmail.trim(),
      password: registerPassword.trim(),
      phone: registerPhone.trim(),
      address: registerAddress.trim(),
      postalCode: registerPostal.trim(),
      mealSlots: allMealSlots
    });

    if (ok) {
      setLoginEmail(registerEmail.trim());
      setLoginPassword('');
      setAuthMode('login');
      setStatus('Registrierung gesendet. Deine Anfrage wartet jetzt auf Freischaltung durch den Admin.');
    }
  };

  const handlePickImage = async () => {
    try {
      const { status: permission } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permission !== 'granted') {
        setStatus('Foto-Berechtigung wurde abgelehnt.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.7,
        allowsEditing: true
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

  const handlePickMenu = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
        multiple: false
      });

      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset) return;

      const mimeType = (asset.mimeType || '').toLowerCase();
      const isAllowedType = mimeType === 'application/pdf' || mimeType.startsWith('image/');
      if (!isAllowedType) {
        setStatus('Nur PDF oder Bild-Dateien sind erlaubt.');
        return;
      }

      const ok = await uploadRestaurantMenu({
        uri: asset.uri,
        name: asset.name || 'menu',
        mimeType: asset.mimeType || 'application/octet-stream',
        file: asset.file
      });

      if (ok) {
        setStatus('Restaurant-Menü hochgeladen.');
      }
    } catch (error) {
      setStatus('Menü konnte nicht hochgeladen werden.');
    }
  };

  const handleGenerateDigitalMenu = async () => {
    if (digitalMenuLoading) return;
    setDigitalMenuStatus('');
    setDigitalMenuError('');
    setDigitalMenuLoading(true);

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
        multiple: false
      });

      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset) return;

      const mimeType = (asset.mimeType || '').toLowerCase();
      const isAllowedType = mimeType === 'application/pdf' || mimeType.startsWith('image/');
      if (!isAllowedType) {
        setDigitalMenuError('Nur PDF oder Bild-Dateien sind erlaubt.');
        return;
      }

      setDigitalMenuStatus('Datei wird analysiert...');
      const generated = await generateRestaurantDigitalMenu({
        uri: asset.uri,
        name: asset.name || 'menu',
        mimeType: asset.mimeType || 'application/octet-stream',
        file: asset.file
      });

      if (!generated) {
        setDigitalMenuError('Kein Menü erkannt. Bitte Dateiqualität prüfen und erneut versuchen.');
        setDigitalMenuStatus('');
        return;
      }

      const draft = buildDigitalMenuDraft(generated);
      if (!draft.items.length) {
        setDigitalMenuError('Die Datei war nicht klar genug lesbar. Bitte erneut mit besserer Qualität hochladen.');
        setDigitalMenuStatus('');
        return;
      }

      setDigitalMenuDraft(draft);
      setDigitalMenuStatus(
        `Menü erstellt: ${draft.items.length} Gerichte erkannt.`
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : '';
      setDigitalMenuError(
        detail
          ? `Digitales Menü konnte nicht erstellt werden: ${detail}`
          : 'Digitales Menü konnte nicht erstellt werden.'
      );
      setDigitalMenuStatus('');
    } finally {
      setDigitalMenuLoading(false);
    }
  };

  const openMenuItemEditor = (item = null) => {
    const defaultSlot = profileSlotList[0] || DEFAULT_MEAL_SLOT;
    setMenuItemOfferMealSlot(defaultSlot);
    setMenuItemOfferPreorderEnabled(false);
    setMenuItemOfferPanelOpen(false);

    if (!item) {
      setMenuItemEditor({
        id: null,
        name: '',
        description: '',
        priceText: '',
        category: 'Normal'
      });
      setMenuItemEditorOpen(true);
      return;
    }

    setMenuItemEditor({
      id: item.id || null,
      name: item.name || '',
      description: item.description || '',
      priceText: toPriceText(item.priceText || item.price),
      category: normalizeDraftCategory(item.category)
    });
    setMenuItemEditorOpen(true);
  };

  const closeMenuItemEditor = () => {
    setMenuItemEditorOpen(false);
    setMenuItemOfferPanelOpen(false);
  };

  const updateMenuItemEditorField = (field, value) => {
    setMenuItemEditor((prev) => ({
      ...prev,
      [field]: value
    }));
  };

  const saveMenuItemEditor = () => {
    const name = String(menuItemEditor.name || '').trim();
    const price = normalizePriceInput(menuItemEditor.priceText);
    if (!name || price === null) {
      setDigitalMenuError('Bitte Name und gültigen Preis eingeben.');
      return;
    }

    const nextItem = {
      id: menuItemEditor.id || createDraftId(),
      name,
      description: String(menuItemEditor.description || '').trim(),
      priceText: price.toFixed(2).replace('.', ','),
      category: normalizeDraftCategory(menuItemEditor.category)
    };

    setDigitalMenuDraft((prev) => {
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

    setDigitalMenuError('');
    setDigitalMenuStatus('Gericht aktualisiert (noch nicht gespeichert).');
    setMenuItemEditorOpen(false);
  };

  const deleteMenuItemEditor = () => {
    if (!menuItemEditor.id) {
      setMenuItemEditorOpen(false);
      return;
    }
    setDigitalMenuDraft((prev) => ({
      ...prev,
      items: prev.items.filter((item) => item.id !== menuItemEditor.id)
    }));
    setDigitalMenuStatus('Gericht entfernt (noch nicht gespeichert).');
    setMenuItemEditorOpen(false);
  };

  const handleTakeMenuItemAsOffer = async () => {
    const name = String(menuItemEditor.name || '').trim();
    const description = String(menuItemEditor.description || '').trim();
    const price = normalizePriceInput(menuItemEditor.priceText);
    if (!name || price === null) {
      setDigitalMenuError('Bitte Name und gültigen Preis eingeben.');
      return;
    }

    const tags = tagsForDigitalCategory(menuItemEditor.category);
    const mealSlot = profileSlotList.includes(menuItemOfferMealSlot)
      ? menuItemOfferMealSlot
      : profileSlotList[0] || DEFAULT_MEAL_SLOT;
    const payload = {
      title: name,
      description: description || 'Aus digitalem Menü übernommen.',
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
      setDigitalMenuError('Als Angebot übernehmen fehlgeschlagen.');
      return;
    }

    setDigitalMenuError('');
    setDigitalMenuStatus(
      existingOffer ? 'Angebot wurde aktualisiert.' : 'Gericht wurde direkt als Angebot übernommen.'
    );
    setMenuItemOfferPanelOpen(false);
    setMenuItemEditorOpen(false);
    setPanelOpen((prev) => ({
      ...prev,
      myOffers: true
    }));
  };

  const groupedDigitalMenu = useMemo(() => {
    const grouped = {
      Vegan: [],
      Vegetarisch: [],
      Normal: []
    };

    (digitalMenuDraft.items || []).forEach((item) => {
      const category = normalizeDraftCategory(item.category);
      grouped[category].push({
        ...item,
        category
      });
    });

    for (const category of digitalCategories) {
      grouped[category].sort((a, b) => a.name.localeCompare(b.name, 'de', { sensitivity: 'base' }));
    }

    return digitalCategories.map((category) => ({
      category,
      items: grouped[category]
    }));
  }, [digitalMenuDraft.items]);

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

  const togglePanel = (key) => {
    setPanelOpen((prev) => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleSaveDigitalMenu = async () => {
    let invalidCount = 0;
    const normalizedItems = (digitalMenuDraft.items || []).map((item) => {
      const name = String(item.name || '').trim();
      const price = normalizePriceInput(item.priceText || item.price);
      if (!name || price === null) {
        invalidCount += 1;
        return null;
      }
      return {
        id: item.id || createDraftId(),
        name,
        description: String(item.description || '').trim(),
        price,
        category: normalizeDraftCategory(item.category)
      };
    });

    if (invalidCount > 0) {
      setDigitalMenuError(`Bitte ${invalidCount} ungültige Einträge korrigieren (Name/Preis).`);
      return;
    }

    if (!normalizedItems.length) {
      setDigitalMenuError('Keine Gerichte vorhanden.');
      return;
    }

    setDigitalMenuSaving(true);
    setDigitalMenuError('');
    try {
      const result = await saveRestaurantDigitalMenu({
        items: normalizedItems.filter(Boolean)
      });
      const nextDraft = buildDigitalMenuDraft(result);
      setDigitalMenuDraft(nextDraft);
      setDigitalMenuStatus('Menü gespeichert.');
    } catch (error) {
      const detail = error instanceof Error ? error.message : '';
      setDigitalMenuError(detail || 'Menü konnte nicht gespeichert werden.');
    } finally {
      setDigitalMenuSaving(false);
    }
  };

  const handleOpenMenu = async () => {
    const menuUrl = restaurant?.menuUrl;
    if (!menuUrl) {
      setStatus('Noch kein Menü hochgeladen.');
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

  const handleSaveRestaurantSettings = async () => {
    if (!restaurant) return;
    const ok = await updateRestaurantProfile({
      mealSlots: settingsSlotList,
      tableReservationEnabled: settingsTableReservationEnabled,
      cuisineTypes: normalizeCuisineTypes(settingsCuisineTypes)
    });
    if (ok) {
      setStatus('Restaurant-Einstellungen gespeichert.');
      setSettingsOpen(false);
    }
  };

  const handleSubmit = async () => {
    setStatus('');
    const cleanedTitle = title.trim();
    const cleanedDescription = description.trim();
    const cleanedPrice = Number(price);

    if (!cleanedTitle || !cleanedDescription || !price) {
      setStatus('Bitte alle Pflichtfelder ausfüllen.');
      return;
    }

    if (!Number.isFinite(cleanedPrice) || cleanedPrice <= 0) {
      setStatus('Bitte einen gültigen Preis eingeben.');
      return;
    }
    if (!profileSlotList.includes(offerMealSlot)) {
      setStatus('Bitte zuerst den Angebotsbereich für dieses Gericht aktivieren.');
      return;
    }

    const tags = [isVegan ? 'vegan' : null, isVegetarian ? 'vegetarian' : null].filter(Boolean);

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
      setStatus(editingOffer ? 'Angebot aktualisiert.' : 'Angebot gespeichert und online.');
      setTitle('');
      setPrice('');
      setDescription('');
      setOfferMealSlot(profileSlotList[0] || DEFAULT_MEAL_SLOT);
      setIsVegan(false);
      setIsVegetarian(false);
      setPreorderEnabled(false);
      setImageUri(null);
      setImageAsset(null);
      setEditingOffer(null);
    }
  };

  const startEdit = (offer) => {
    if (offer?.mealSlot && !profileSlotList.includes(offer.mealSlot)) {
      setProfileMealSlots((prev) => normalizeMealSlots([...prev, offer.mealSlot]));
    }
    setPanelOpen((prev) => ({
      ...prev,
      newOffer: true
    }));
    setEditingOffer(offer);
    setTitle(offer.title || '');
    setPrice(offer.price != null ? String(offer.price) : '');
    setDescription(offer.description || '');
    setOfferMealSlot(offer.mealSlot || DEFAULT_MEAL_SLOT);
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
    setIsVegan(false);
    setIsVegetarian(false);
    setPreorderEnabled(false);
    setImageUri(null);
    setImageAsset(null);
    setStatus('Bearbeitung abgebrochen.');
  };

  return (
    <LinearGradient colors={[colors.bgTop, colors.bgBottom]} style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {restaurant ? (
            <View style={styles.topBar}>
              <View style={styles.topBarActions}>
                <Pressable
                  onPress={() => setProfileOpen((prev) => !prev)}
                  style={({ pressed }) => [styles.profileIconButton, pressed && styles.iconPressed]}
                >
                  <Ionicons name="person" size={20} color={colors.ink} />
                </Pressable>
                <Pressable
                  onPress={() => setSettingsOpen(true)}
                  style={({ pressed }) => [styles.settingsButton, pressed && styles.iconPressed]}
                >
                  <Ionicons name="settings-outline" size={16} color={colors.accent} />
                  <Text style={styles.settingsButtonText}>Restaurant Einstellungen</Text>
                </Pressable>
              </View>
              <View style={styles.header}>
                <View style={styles.brandMark}>
                  <Image source={appIcon} style={styles.logoImage} />
                </View>
                <View style={styles.headerText}>
                  <Text style={styles.subtitle}>{headerSubtitle}</Text>
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.authHeroWrap}>
              <LinearGradient
                colors={['#8AB9FF', '#77ABFF', '#6D9EFF']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.authHero}
              >
                {onBack ? (
                  <Pressable
                    onPress={onBack}
                    style={({ pressed }) => [styles.authBackButton, pressed && styles.iconPressed]}
                  >
                    <Ionicons name="arrow-back" size={18} color={colors.white} />
                  </Pressable>
                ) : null}
                <Image source={appIcon} style={styles.authHeroLogo} />
                <Text style={styles.authHeroTitle}>Als Restaurant anmelden</Text>
                <Text style={styles.authHeroSubtitle}>
                  Verwalte dein Profil, Angebote und Bestellungen direkt in der App.
                </Text>
              </LinearGradient>
            </View>
          )}

          {restaurant && profileOpen ? (
            <View style={styles.profileCard}>
              <Text style={styles.cardTitle}>Restaurant-Profil</Text>
              <Text style={styles.profileLine}>{restaurant.name}</Text>
              <Text style={styles.profileLine}>{restaurant.email}</Text>
              <Text style={styles.profileLine}>{restaurant.phone}</Text>
              <Text style={styles.profileLine}>{restaurant.address}</Text>
              <Text style={styles.profileLine}>PLZ {restaurant.postalCode}</Text>
              <Text style={styles.profileLine}>
                Bereiche:{' '}
                {normalizeMealSlots(restaurant.mealSlots)
                  .map((slot) => mealSlotLabelByKey[slot] || slot)
                  .join(', ')}
              </Text>
              <Text style={styles.profileLine}>
                Tischreservierung: {restaurant.tableReservationEnabled ? 'aktiv' : 'deaktiviert'}
              </Text>
              {restaurant.cuisineTypes?.length ? (
                <Text style={styles.profileLine}>Küche: {restaurant.cuisineTypes.join(', ')}</Text>
              ) : null}
              <Pressable style={styles.outlineButton} onPress={logout}>
                <Text style={styles.outlineButtonText}>Abmelden</Text>
              </Pressable>
            </View>
          ) : null}

          <Modal
            visible={settingsOpen}
            transparent
            animationType="fade"
            onRequestClose={() => setSettingsOpen(false)}
          >
            <View style={styles.modalBackdrop}>
              <View style={styles.modalCard}>
                <Text style={styles.cardTitle}>Restaurant Einstellungen</Text>
                <Text style={styles.sectionLabel}>Sichtbarkeit</Text>
                <View style={styles.mealSlotRow}>
                  {mealSlotOptions.map((option) => (
                    <MealSlotChip
                      key={option.key}
                      label={option.label}
                      active={settingsSlotList.includes(option.key)}
                      onPress={() =>
                        setSettingsMealSlots((prev) =>
                          toggleMealSlot(normalizeMealSlots(prev), option.key)
                        )
                      }
                    />
                  ))}
                </View>
                <Text style={styles.sectionLabel}>Art Restaurant</Text>
                <View style={styles.cuisineRow}>
                  {cuisineTypeOptions.map((cuisine) => (
                    <Pressable
                      key={cuisine}
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
                <Pressable
                  style={[
                    styles.preorderToggle,
                    settingsTableReservationEnabled ? styles.preorderOn : styles.preorderOff
                  ]}
                  onPress={() =>
                    setSettingsTableReservationEnabled((prev) => !prev)
                  }
                >
                  <Text style={styles.preorderToggleText}>
                    {settingsTableReservationEnabled
                      ? 'Tischreservierung freigeschaltet'
                      : 'Tischreservierung deaktiviert'}
                  </Text>
                </Pressable>
                <Pressable
                  style={styles.button}
                  onPress={handleSaveRestaurantSettings}
                  disabled={restaurantLoading}
                >
                  <Text style={styles.buttonText}>
                    {restaurantLoading ? 'Bitte warten...' : 'Einstellungen speichern'}
                  </Text>
                </Pressable>
                <Pressable
                  style={styles.outlineButton}
                  onPress={() => setSettingsOpen(false)}
                >
                  <Text style={styles.outlineButtonText}>Schließen</Text>
                </Pressable>
              </View>
            </View>
          </Modal>

          {!restaurant ? (
            <>
              {authMode === 'login' ? (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Restaurant-Login</Text>
                  <Text style={styles.helperText}>
                    Nach der Freischaltung kannst du dich hier anmelden.
                  </Text>
                  <TextInput
                    placeholder="E-Mail"
                    value={loginEmail}
                    onChangeText={setLoginEmail}
                    keyboardType="email-address"
                    style={styles.input}
                  />
                  <TextInput
                    placeholder="Passwort"
                    value={loginPassword}
                    onChangeText={setLoginPassword}
                    secureTextEntry
                    style={styles.input}
                  />
                  <Pressable style={styles.button} onPress={handleLogin}>
                    <Text style={styles.buttonText}>
                      {restaurantLoading ? 'Bitte warten...' : 'Einloggen'}
                    </Text>
                  </Pressable>
                  <Pressable onPress={() => setAuthMode('register')} style={styles.authSwitchLink}>
                    <Text style={styles.authSwitchText}>Kein Konto? Dann registrieren</Text>
                  </Pressable>
                  {restaurantError ? <Text style={styles.errorText}>{restaurantError}</Text> : null}
                </View>
              ) : (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Restaurant registrieren</Text>
                  <Text style={styles.helperText}>
                    Nach der Registrierung wartet dein Konto auf Freischaltung durch den Admin.
                  </Text>
                  <TextInput
                    placeholder="Restaurantname"
                    value={registerName}
                    onChangeText={setRegisterName}
                    style={styles.input}
                  />
                  <TextInput
                    placeholder="E-Mail"
                    value={registerEmail}
                    onChangeText={setRegisterEmail}
                    keyboardType="email-address"
                    style={styles.input}
                  />
                  <TextInput
                    placeholder="Passwort"
                    value={registerPassword}
                    onChangeText={setRegisterPassword}
                    secureTextEntry
                    style={styles.input}
                  />
                  <TextInput
                    placeholder="Telefonnummer"
                    value={registerPhone}
                    onChangeText={setRegisterPhone}
                    keyboardType="phone-pad"
                    style={styles.input}
                  />
                  <TextInput
                    placeholder="Adresse"
                    value={registerAddress}
                    onChangeText={setRegisterAddress}
                    style={styles.input}
                  />
                  <TextInput
                    placeholder="Postleitzahl"
                    value={registerPostal}
                    onChangeText={setRegisterPostal}
                    keyboardType="number-pad"
                    maxLength={5}
                    style={styles.input}
                  />
                  <Pressable style={styles.button} onPress={handleRegister}>
                    <Text style={styles.buttonText}>
                      {restaurantLoading ? 'Bitte warten...' : 'Registrierung senden'}
                    </Text>
                  </Pressable>
                  <Pressable onPress={() => setAuthMode('login')} style={styles.authSwitchLink}>
                    <Text style={styles.authSwitchText}>Schon registriert? Zum Einloggen</Text>
                  </Pressable>
                  {restaurantError ? <Text style={styles.errorText}>{restaurantError}</Text> : null}
                </View>
              )}

              {status ? <Text style={styles.status}>{status}</Text> : null}
            </>
          ) : (
            <>
              <View style={styles.dashboardGrid}>
                <Pressable
                  style={[styles.dashboardTile, panelOpen.restaurantMenu && styles.dashboardTileActive]}
                  onPress={() => togglePanel('restaurantMenu')}
                >
                  <Text style={styles.dashboardTileTitle}>Restaurant-Menü</Text>
                  <Text style={styles.dashboardTileText}>PDF hochladen und normal anzeigen.</Text>
                </Pressable>
                <Pressable
                  style={[styles.dashboardTile, panelOpen.currentMenu && styles.dashboardTileActive]}
                  onPress={() => togglePanel('currentMenu')}
                >
                  <Text style={styles.dashboardTileTitle}>Meine aktuelle Menü</Text>
                  <Text style={styles.dashboardTileText}>KI-Menü prüfen und bearbeiten.</Text>
                </Pressable>
                <Pressable
                  style={[styles.dashboardTile, panelOpen.newOffer && styles.dashboardTileActive]}
                  onPress={() => togglePanel('newOffer')}
                >
                  <Text style={styles.dashboardTileTitle}>Neues Angebot erstellen</Text>
                  <Text style={styles.dashboardTileText}>Gerichte als Angebot veröffentlichen.</Text>
                </Pressable>
                <Pressable
                  style={[styles.dashboardTile, panelOpen.myOffers && styles.dashboardTileActive]}
                  onPress={() => togglePanel('myOffers')}
                >
                  <Text style={styles.dashboardTileTitle}>Meine Angebote</Text>
                  <Text style={styles.dashboardTileText}>Aktive Angebote anzeigen.</Text>
                </Pressable>
              </View>

              {panelOpen.restaurantMenu ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Restaurant-Menü</Text>
                <Text style={styles.helperText}>PDF oder Bild hochladen, damit Nutzer dein Menü sehen.</Text>
                <Pressable style={styles.imageButton} onPress={handlePickMenu}>
                  <Ionicons name="cloud-upload" size={18} color={colors.ink} />
                  <Text style={styles.imageButtonText}>
                    {restaurantLoading ? 'Bitte warten...' : 'Menü hochladen (Bild/PDF)'}
                  </Text>
                </Pressable>
                {restaurant?.menuUrl ? (
                  <Pressable style={styles.outlineButton} onPress={handleOpenMenu}>
                    <Text style={styles.outlineButtonText}>Restaurant-Menü ansehen</Text>
                  </Pressable>
                ) : (
                  <Text style={styles.helperText}>Noch kein Menü hochgeladen.</Text>
                )}
                <Pressable
                  style={styles.imageButton}
                  onPress={handleGenerateDigitalMenu}
                  disabled={digitalMenuLoading}
                >
                  <Ionicons name="sparkles" size={18} color={colors.ink} />
                  <Text style={styles.imageButtonText}>
                    {digitalMenuLoading ? 'Bitte warten...' : 'Digitales Menü erstellen (OpenAI)'}
                  </Text>
                </Pressable>
                {restaurantError ? <Text style={styles.errorText}>{restaurantError}</Text> : null}
                {status ? <Text style={styles.status}>{status}</Text> : null}
              </View>
              ) : null}

              {panelOpen.currentMenu ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Meine aktuelle Menü</Text>

                {digitalMenuDraft.duplicatesRemoved > 0 ? (
                  <Text style={styles.helperText}>
                    Bereinigt: {digitalMenuDraft.duplicatesRemoved} doppelte Einträge entfernt.
                  </Text>
                ) : null}
                {(digitalMenuDraft.warnings || []).map((warning, index) => (
                  <Text key={`${warning}-${index}`} style={styles.helperText}>
                    Hinweis: {warning}
                  </Text>
                ))}
                {digitalMenuStatus ? <Text style={styles.status}>{digitalMenuStatus}</Text> : null}
                {digitalMenuError ? <Text style={styles.errorText}>{digitalMenuError}</Text> : null}
                <View style={styles.digitalMenuList}>
                  {groupedDigitalMenu.map((group) => (
                    <View key={group.category} style={styles.digitalCategoryBlock}>
                      <Text
                        style={[
                          styles.digitalCategoryTitle,
                          group.category === 'Vegan' && styles.digitalCategoryTitleVegan,
                          group.category === 'Vegetarisch' && styles.digitalCategoryTitleVegetarian,
                          group.category === 'Normal' && styles.digitalCategoryTitleNormal
                        ]}
                      >
                        {group.category}
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
                                {isMenuItemMarkedAsOffer(item) ? (
                                  <View style={styles.menuOfferBadge}>
                                    <Ionicons name="pricetag" size={11} color={colors.white} />
                                  </View>
                                ) : null}
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

                <View style={styles.digitalGlobalActions}>
                  <Pressable style={styles.outlineButton} onPress={() => openMenuItemEditor(null)}>
                    <Text style={styles.outlineButtonText}>Gericht hinzufügen</Text>
                  </Pressable>
                  <Pressable
                    style={styles.button}
                    onPress={handleSaveDigitalMenu}
                    disabled={digitalMenuSaving}
                  >
                    <Text style={styles.buttonText}>
                      {digitalMenuSaving ? 'Speichert...' : 'Menü speichern'}
                    </Text>
                  </Pressable>
                </View>
                {digitalMenuDraft.updatedAt ? (
                  <Text style={styles.helperText}>
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
              </View>
              ) : null}

              <Modal visible={menuItemEditorOpen} transparent animationType="fade" onRequestClose={closeMenuItemEditor}>
                <View style={styles.modalBackdrop}>
                  <View style={styles.modalCard}>
                    <Text style={styles.cardTitle}>
                      {menuItemEditor.id ? 'Gericht bearbeiten' : 'Neues Gericht'}
                    </Text>
                    <TextInput
                      value={menuItemEditor.name}
                      onChangeText={(value) => updateMenuItemEditorField('name', value)}
                      placeholder="Name"
                      style={styles.input}
                    />
                    <TextInput
                      value={menuItemEditor.priceText}
                      onChangeText={(value) => updateMenuItemEditorField('priceText', value)}
                      placeholder="Preis (z.B. 9,90)"
                      keyboardType="decimal-pad"
                      style={styles.input}
                    />
                    <TextInput
                      value={menuItemEditor.description}
                      onChangeText={(value) => updateMenuItemEditorField('description', value)}
                      placeholder="Beschreibung (optional)"
                      style={[styles.input, styles.textArea]}
                      multiline
                    />
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
                            {category}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                    <Pressable style={styles.button} onPress={saveMenuItemEditor}>
                      <Text style={styles.buttonText}>Übernehmen</Text>
                    </Pressable>
                    <Pressable
                      style={styles.secondaryButtonAction}
                      onPress={() => setMenuItemOfferPanelOpen((prev) => !prev)}
                    >
                      <View style={styles.secondaryButtonActionRow}>
                        <Text style={styles.secondaryButtonActionText}>Als Angebot übernehmen</Text>
                        <Ionicons
                          name={menuItemOfferPanelOpen ? 'chevron-up' : 'chevron-down'}
                          size={16}
                          color={colors.ink}
                        />
                      </View>
                    </Pressable>
                    {menuItemOfferPanelOpen ? (
                      <View style={styles.menuItemOfferPanel}>
                        <Text style={styles.sectionLabel}>Bereich für dieses Angebot</Text>
                        <View style={styles.mealSlotRowCompact}>
                          {profileSlotList.map((slot) => (
                            <MealSlotChip
                              key={`menu-item-offer-${slot}`}
                              label={mealSlotLabelByKey[slot] || slot}
                              compact
                              tiny
                              active={menuItemOfferMealSlot === slot}
                              onPress={() => setMenuItemOfferMealSlot(slot)}
                            />
                          ))}
                        </View>
                        <Pressable
                          style={[
                            styles.preorderToggle,
                            styles.preorderToggleCompact,
                            menuItemOfferPreorderEnabled ? styles.preorderOn : styles.preorderOff
                          ]}
                          onPress={() => setMenuItemOfferPreorderEnabled((prev) => !prev)}
                        >
                          <Text style={[styles.preorderToggleText, styles.preorderToggleTextCompact]}>
                            {menuItemOfferPreorderEnabled ? 'Vorbestellung aktiv' : 'Vorbestellung deaktiviert'}
                          </Text>
                        </Pressable>
                        <Pressable style={styles.buttonSmall} onPress={handleTakeMenuItemAsOffer}>
                          <Text style={styles.buttonSmallText}>Jetzt als Angebot speichern</Text>
                        </Pressable>
                      </View>
                    ) : null}
                    {menuItemEditor.id ? (
                      <Pressable style={styles.removeButtonWide} onPress={deleteMenuItemEditor}>
                        <Text style={styles.removeButtonWideText}>Löschen</Text>
                      </Pressable>
                    ) : null}
                    <Pressable style={styles.outlineButton} onPress={closeMenuItemEditor}>
                      <Text style={styles.outlineButtonText}>Abbrechen</Text>
                    </Pressable>
                  </View>
                </View>
              </Modal>

              {panelOpen.newOffer ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>
                  {editingOffer ? 'Angebot bearbeiten' : 'Neues Angebot'}
                </Text>
                <View style={styles.composerBody}>
                  <TextInput
                    placeholder="Gericht / Angebot"
                    value={title}
                    onChangeText={setTitle}
                    style={styles.input}
                  />
                  <TextInput
                    placeholder="Preis (EUR)"
                    value={price}
                    onChangeText={setPrice}
                    keyboardType="decimal-pad"
                    style={styles.input}
                  />
                  <TextInput
                    placeholder="Kurzbeschreibung"
                    value={description}
                    onChangeText={setDescription}
                    style={[styles.input, styles.textArea]}
                    multiline
                  />
                  <Text style={styles.sectionLabel}>Bereich für dieses Angebot</Text>
                  <View style={styles.mealSlotRow}>
                    {mealSlotOptions.map((option) => {
                      const enabled = profileSlotList.includes(option.key);
                      return (
                        <MealSlotChip
                          key={option.key}
                          label={option.label}
                          active={offerMealSlot === option.key}
                          compact
                          disabled={!enabled}
                          onPress={() => {
                            if (!enabled) return;
                            setOfferMealSlot(option.key);
                          }}
                        />
                      );
                    })}
                  </View>
                  <Text style={styles.helperText}>
                    Aktive Restaurant-Bereiche:{' '}
                    {profileSlotList.map((slot) => mealSlotLabelByKey[slot] || slot).join(', ')}
                  </Text>
                  <View style={styles.tagRow}>
                    <TagToggle
                      label="vegan"
                      active={isVegan}
                      onPress={() => setIsVegan((p) => !p)}
                    />
                    <TagToggle
                      label="vegetarisch"
                      active={isVegetarian}
                      onPress={() => setIsVegetarian((p) => !p)}
                      tone="gold"
                    />
                  </View>
                  <Pressable
                    style={[
                      styles.preorderToggle,
                      preorderEnabled ? styles.preorderOn : styles.preorderOff
                    ]}
                    onPress={() => setPreorderEnabled((prev) => !prev)}
                  >
                    <Text style={styles.preorderToggleText}>
                      {preorderEnabled ? 'Vorbestellung aktiv' : 'Vorbestellung deaktiviert'}
                    </Text>
                  </Pressable>
                  <Pressable style={styles.imageButton} onPress={handlePickImage}>
                    <Ionicons name="image" size={18} color={colors.ink} />
                    <Text style={styles.imageButtonText}>Bild auswählen (optional)</Text>
                  </Pressable>
                  {imageUri ? <Image source={{ uri: imageUri }} style={styles.preview} /> : null}
                  <Text style={styles.helperText}>
                    Das Bild wird beim Speichern auf den Server hochgeladen.
                  </Text>
                  <Pressable style={styles.button} onPress={handleSubmit}>
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
              ) : null}

              {panelOpen.myOffers ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Meine Angebote</Text>
                {restaurantOffers.map((offer) => (
                  <View key={offer.id} style={styles.offerRow}>
                    <View style={styles.offerInfo}>
                      <Text style={styles.offerTitle}>{offer.title}</Text>
                      <Text style={styles.offerMeta}>
                        {formatPrice(offer.price)} - {mealSlotLabelByKey[offer.mealSlot] || 'Mittagstisch'}
                      </Text>
                      <Text style={styles.offerDescription} numberOfLines={2}>
                        {offer.description || 'Keine Beschreibung'}
                      </Text>
                    </View>
                    <View style={styles.offerActions}>
                      <Pressable
                        style={[
                          styles.statusPill,
                          offer.preorderEnabled ? styles.preorderOn : styles.preorderOff
                        ]}
                        onPress={() =>
                          updateRestaurantOffer(offer.id, {
                            preorderEnabled: !offer.preorderEnabled
                          })
                        }
                      >
                        <Text style={styles.statusPillText}>
                          {offer.preorderEnabled ? 'Vorbestellung an' : 'Vorbestellung aus'}
                        </Text>
                      </Pressable>
                      <Pressable style={styles.offerEditButton} onPress={() => startEdit(offer)}>
                        <Ionicons name="create" size={16} color={colors.white} />
                        <Text style={styles.offerEditButtonText}>Bearbeiten</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
                {!restaurantOffers.length ? (
                  <Text style={styles.helperText}>Noch keine Angebote erstellt.</Text>
                ) : null}
              </View>
              ) : null}

              <View style={styles.card}>
                <Text style={styles.cardTitle}>Bestellungen</Text>
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
                    <View style={styles.orderActions}>
                      <View
                        style={[
                          styles.statusPill,
                          order.status === 'confirmed' ? styles.statusOn : styles.statusOff
                        ]}
                      >
                        <Text style={styles.statusPillText}>
                          {order.status === 'confirmed' ? 'Bestätigt' : 'Offen'}
                        </Text>
                      </View>
                      {order.status !== 'confirmed' ? (
                        <Pressable
                          style={styles.editButton}
                          onPress={() => updateRestaurantOrder(order.id, 'confirmed')}
                        >
                          <Ionicons name="checkmark" size={16} color={colors.white} />
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                ))}
                {!restaurantOrders.length ? (
                  <Text style={styles.helperText}>Noch keine Bestellungen.</Text>
                ) : null}
              </View>

              <View style={styles.card}>
                <Text style={styles.cardTitle}>Tischreservierungen</Text>
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
                    <View style={styles.orderActions}>
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
                  <Text style={styles.helperText}>Noch keine Reservierungen.</Text>
                ) : null}
              </View>
            </>
          )}

        </ScrollView>
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
  topBar: {
    marginBottom: spacing.lg
  },
  topBarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md
  },
  profileIconButton: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow
  },
  settingsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    backgroundColor: colors.white,
    ...shadow
  },
  settingsButtonText: {
    fontFamily: fonts.bodyStrong,
    color: colors.accent,
    fontSize: 12
  },
  iconPressed: {
    opacity: 0.85
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md
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
  logoImage: {
    width: 54,
    height: 54,
    borderRadius: 16
  },
  headerText: {
    flex: 1
  },
  subtitle: {
    fontFamily: fonts.displaySoft,
    fontSize: 22,
    color: colors.ink
  },
  authHeroWrap: {
    marginBottom: spacing.lg
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
  authHeroTitle: {
    fontFamily: fonts.display,
    fontSize: 30,
    color: colors.white,
    textAlign: 'center'
  },
  authHeroSubtitle: {
    marginTop: spacing.xs,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.95)',
    textAlign: 'center'
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
  dashboardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
    gap: spacing.sm
  },
  dashboardTile: {
    width: '48%',
    minHeight: 118,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    justifyContent: 'space-between',
    ...shadow
  },
  dashboardTileActive: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(0, 188, 212, 0.08)'
  },
  dashboardTileTitle: {
    fontFamily: fonts.bodyStrong,
    color: colors.ink,
    fontSize: 15
  },
  dashboardTileText: {
    marginTop: spacing.xs,
    fontFamily: fonts.body,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18
  },
  cardTitle: {
    fontFamily: fonts.displaySoft,
    fontSize: 18,
    color: colors.ink,
    marginBottom: spacing.sm
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
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.line
  },
  helperText: {
    fontFamily: fonts.body,
    color: colors.muted,
    marginTop: spacing.sm
  },
  sectionLabel: {
    fontFamily: fonts.bodyStrong,
    color: colors.muted,
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
    marginBottom: spacing.sm
  },
  textArea: {
    minHeight: 90,
    textAlignVertical: 'top'
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: spacing.sm
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
    marginTop: spacing.sm
  },
  outlineButtonText: {
    fontFamily: fonts.bodyStrong,
    color: colors.accent
  },
  status: {
    fontFamily: fonts.body,
    color: colors.accentCool,
    marginTop: spacing.sm
  },
  errorText: {
    fontFamily: fonts.body,
    color: colors.accentWarm,
    marginTop: spacing.sm
  },
  tagRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm
  },
  mealSlotRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.sm
  },
  mealSlotRowCompact: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.xs
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
  tagToggle: {
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    backgroundColor: 'rgba(47, 138, 111, 0.12)'
  },
  tagToggleGold: {
    backgroundColor: 'rgba(240, 184, 75, 0.25)'
  },
  tagToggleActive: {
    borderWidth: 1,
    borderColor: colors.accentCool
  },
  tagToggleText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 13,
    color: colors.ink
  },
  preorderToggle: {
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.md
  },
  preorderToggleCompact: {
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8
  },
  preorderToggleText: {
    fontFamily: fonts.bodyStrong,
    color: colors.white
  },
  preorderToggleTextCompact: {
    fontSize: 13
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
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: colors.cardDeep,
    marginBottom: spacing.sm
  },
  imageButtonText: {
    fontFamily: fonts.bodyStrong,
    color: colors.ink
  },
  digitalMenuList: {
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    overflow: 'hidden'
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
  digitalCategoryTitleVegan: {
    backgroundColor: 'rgba(34, 197, 94, 0.18)'
  },
  digitalCategoryTitleVegetarian: {
    backgroundColor: 'rgba(255, 213, 79, 0.38)'
  },
  digitalCategoryTitleNormal: {
    backgroundColor: 'rgba(249, 115, 22, 0.16)'
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
    backgroundColor: colors.accentWarm,
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 4
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
  digitalListEmpty: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    fontFamily: fonts.body,
    color: colors.muted
  },
  digitalGlobalActions: {
    marginTop: spacing.md
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    padding: spacing.sm,
    paddingHorizontal: spacing.lg
  },
  modalCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.line,
    ...shadow
  },
  digitalCategoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.sm
  },
  menuItemOfferPanel: {
    marginTop: spacing.xs,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    padding: spacing.sm
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
  secondaryButtonAction: {
    marginTop: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
    paddingVertical: 11,
    paddingHorizontal: spacing.sm
  },
  secondaryButtonActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs
  },
  secondaryButtonActionText: {
    fontFamily: fonts.bodyStrong,
    color: colors.ink
  },
  preview: {
    width: '100%',
    height: 180,
    borderRadius: radius.md,
    marginBottom: spacing.sm
  },
  offerRow: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    gap: spacing.sm
  },
  offerInfo: {
    gap: 2
  },
  offerTitle: {
    fontFamily: fonts.bodyStrong,
    color: colors.ink
  },
  offerMeta: {
    fontFamily: fonts.body,
    color: colors.muted
  },
  offerDescription: {
    marginTop: 2,
    fontFamily: fonts.body,
    color: colors.ink
  },
  offerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap'
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
  offerEditButtonText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 12,
    color: colors.white
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


