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
  Keyboard
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import OfferCard from '../components/OfferCard';
import { colors, fonts, radius, spacing } from '../theme/theme';
import { useOffers, formatPrice } from '../store/OffersContext';

const appIcon = require('../../assets/icon33.jpeg');
const heroIcon = require('../../assets/ohneBack.png');
const mealSlotOptions = [
  { key: 'breakfast', label: 'Frühstück' },
  { key: 'lunch', label: 'Mittagstisch' },
  { key: 'dinner', label: 'Abendessen' }
];
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const timeStepMinutes = 15;
const mealSlotDefaultMinutes = {
  breakfast: 9 * 60,
  lunch: 12 * 60,
  dinner: 18 * 60
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

const buildRestaurantRatingKey = (offer) => {
  if (!offer) return '';
  return offer.restaurantId || `${offer.restaurant || 'restaurant'}|${offer.address || 'address'}`;
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

const UserScreen = ({ onOpenRestaurant }) => {
  const {
    offers,
    offersLoading,
    offersError,
    fetchOffers,
    placeOrder,
    orderStatus,
    orderError,
    getPublicRestaurantDigitalMenu,
    placeTableReservation,
    reservationStatus,
    reservationError
  } = useOffers();
  const insets = useSafeAreaInsets();
  const canUseNativeDriver = Platform.OS !== 'web';
  const [query, setQuery] = useState('');
  const [activePostal, setActivePostal] = useState('');
  const [activeMealSlot, setActiveMealSlot] = useState('lunch');
  const [veganOnly, setVeganOnly] = useState(false);
  const [vegetarianOnly, setVegetarianOnly] = useState(false);
  const [preorderOnly, setPreorderOnly] = useState(false);
  const [sortMode, setSortMode] = useState('none');
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState(null);
  const [orderName, setOrderName] = useState('');
  const [orderEmail, setOrderEmail] = useState('');
  const [orderQty, setOrderQty] = useState('1');
  const [orderTime, setOrderTime] = useState('');
  const [orderType, setOrderType] = useState('pickup');
  const [orderLocalError, setOrderLocalError] = useState('');
  const [restaurantRatings, setRestaurantRatings] = useState({});
  const [ratingValue, setRatingValue] = useState(0);
  const [ratingText, setRatingText] = useState('');
  const [ratingError, setRatingError] = useState('');
  const [ratingStatus, setRatingStatus] = useState('');
  const [restaurantInfoOpen, setRestaurantInfoOpen] = useState(false);
  const [digitalMenuLoading, setDigitalMenuLoading] = useState(false);
  const [digitalMenuError, setDigitalMenuError] = useState('');
  const [digitalMenuItems, setDigitalMenuItems] = useState([]);
  const [digitalMenuUpdatedAt, setDigitalMenuUpdatedAt] = useState(null);
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
  const [ratingPanelOpen, setRatingPanelOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isOfferHeaderCompact, setIsOfferHeaderCompact] = useState(false);
  const [activeFooterTab, setActiveFooterTab] = useState('food');
  const entrance = useRef(new Animated.Value(0)).current;
  const menuAnim = useRef(new Animated.Value(0)).current;
  const modalAnim = useRef(new Animated.Value(0)).current;
  const compactHeaderAnim = useRef(new Animated.Value(0)).current;
  const offerCompactRef = useRef(false);
  const orderTimeScrollRef = useRef(null);

  useEffect(() => {
    Animated.timing(entrance, {
      toValue: 1,
      duration: 520,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: canUseNativeDriver
    }).start();
  }, [entrance, canUseNativeDriver]);

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

  const postalValid = /^\d{5}$/.test(activePostal);
  const selectedMealLabel =
    mealSlotOptions.find((option) => option.key === activeMealSlot)?.label || 'Mittagstisch';
  const filtered = useMemo(() => {
    if (!activePostal) return [];
    if (!postalValid) return [];

    let list = offers;
    list = list.filter((offer) => offer.mealSlot === activeMealSlot);

    if (veganOnly) {
      list = list.filter((offer) => offer.tags?.includes('vegan'));
    }

    if (vegetarianOnly) {
      list = list.filter((offer) => offer.tags?.includes('vegetarian'));
    }

    if (preorderOnly) {
      list = list.filter((offer) => offer.preorderEnabled);
    }

    list = list.filter((offer) => offer.active !== false);

    if (sortMode === 'priceAsc') {
      list = [...list].sort((a, b) => {
        const aPrice = Number.isFinite(Number(a.price)) && Number(a.price) > 0
          ? Number(a.price)
          : Number.POSITIVE_INFINITY;
        const bPrice = Number.isFinite(Number(b.price)) && Number(b.price) > 0
          ? Number(b.price)
          : Number.POSITIVE_INFINITY;
        return aPrice - bPrice;
      });
    } else if (sortMode === 'distanceAsc') {
      list = [...list].sort((a, b) => {
        const aDistance = typeof a.distanceKm === 'number' ? a.distanceKm : Number.POSITIVE_INFINITY;
        const bDistance = typeof b.distanceKm === 'number' ? b.distanceKm : Number.POSITIVE_INFINITY;
        return aDistance - bDistance;
      });
    } else if (sortMode === 'distanceDesc') {
      list = [...list].sort((a, b) => {
        const aDistance = typeof a.distanceKm === 'number' ? a.distanceKm : Number.NEGATIVE_INFINITY;
        const bDistance = typeof b.distanceKm === 'number' ? b.distanceKm : Number.NEGATIVE_INFINITY;
        return bDistance - aDistance;
      });
    }

    return list;
  }, [offers, activeMealSlot, veganOnly, vegetarianOnly, preorderOnly, sortMode, activePostal, postalValid]);

  const hasAdvancedFilters = preorderOnly || sortMode !== 'none';

  const statusText = () => {
    if (!activePostal) return 'Postleitzahl eingeben, um Restaurants zu sehen.';
    if (!postalValid) return 'Bitte eine gültige 5-stellige Postleitzahl eingeben.';
    if (offersLoading) return 'Lade Restaurants...';
    if (offersError) return offersError;
    return `Gefunden: ${filtered.length} Restaurants für ${selectedMealLabel} im Umkreis von 10 km.`;
  };

  const handleSearch = () => {
    const value = query.trim();
    setActivePostal(value);
    if (/^\d{5}$/.test(value)) {
      fetchOffers(value, 10, activeMealSlot);
    }
  };

  useEffect(() => {
    if (!activePostal || !postalValid) return;
    fetchOffers(activePostal, 10, activeMealSlot);
  }, [activePostal, postalValid, activeMealSlot]);

  const headerAnim = {
    opacity: entrance,
    transform: [
      {
        translateY: entrance.interpolate({
          inputRange: [0, 1],
          outputRange: [16, 0]
        })
      }
    ]
  };

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
  const showRestaurantInfoPanel = restaurantInfoOpen || selectedOfferIsRestaurantOnly;
  const offerModalCardStyles = [
    styles.offerModalCard,
    modalCardStyle,
    selectedOfferIsRestaurantOnly && styles.offerModalCardSimpleInfo
  ];
  const selectedRestaurantRatingKey = buildRestaurantRatingKey(selectedOffer);
  const selectedRestaurantRating = selectedRestaurantRatingKey
    ? restaurantRatings[selectedRestaurantRatingKey]
    : undefined;
  const orderMealSlot = selectedOffer?.mealSlot || activeMealSlot || 'lunch';
  const orderDefaultMinutes = mealSlotDefaultMinutes[orderMealSlot] ?? mealSlotDefaultMinutes.lunch;
  const orderDefaultTime = toTimeLabel(orderDefaultMinutes);
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
      options.push({
        key: toDateKey(date),
        label: date.toLocaleDateString('de-DE', {
          weekday: 'short',
          day: '2-digit',
          month: '2-digit'
        })
      });
    }
    return options;
  }, []);

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

  const handleOpenOffer = (offer) => {
    const mealSlot = offer?.mealSlot || activeMealSlot || 'lunch';
    const defaultMinutes = mealSlotDefaultMinutes[mealSlot] ?? mealSlotDefaultMinutes.lunch;
    const defaultTime = toTimeLabel(defaultMinutes);
    const ratingKey = buildRestaurantRatingKey(offer);
    const savedRating = ratingKey ? restaurantRatings[ratingKey] : undefined;

    setSelectedOffer(offer);
    setOrderName('');
    setOrderQty('1');
    setOrderTime(defaultTime);
    setOrderType('pickup');
    setOrderLocalError('');
    setDigitalMenuItems([]);
    setDigitalMenuUpdatedAt(null);
    setDigitalMenuError('');
    setDigitalMenuLoading(false);
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
    setRatingPanelOpen(false);
    setRatingValue(savedRating?.stars ?? 0);
    setRatingText(savedRating?.text ?? '');
    setRatingError('');
    setRatingStatus('');
    setRestaurantInfoOpen(Boolean(offer?.isRestaurantOnly));
    setIsOfferHeaderCompact(false);
    offerCompactRef.current = false;
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
      setRatingError('');
      setRatingStatus('');
      setDigitalMenuError('');
      setDigitalMenuItems([]);
      setDigitalMenuUpdatedAt(null);
      setReservationLocalError('');
      setPreorderPanelOpen(false);
      setReservationPanelOpen(false);
      setReservationInfoPanelOpen(false);
      setRatingPanelOpen(false);
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

  const handleSubmitRating = () => {
    if (!selectedOffer) return;
    if (ratingValue < 1) {
      setRatingError('Bitte Sterne auswählen.');
      setRatingStatus('');
      return;
    }

    const key = buildRestaurantRatingKey(selectedOffer);
    if (!key) {
      setRatingError('Bewertung konnte nicht gespeichert werden.');
      setRatingStatus('');
      return;
    }

    const nextRating = {
      stars: ratingValue,
      text: ratingText.trim(),
      updatedAt: new Date().toISOString()
    };

    setRestaurantRatings((prev) => ({
      ...prev,
      [key]: nextRating
    }));
    setRatingError('');
    setRatingStatus(`Danke! Deine Bewertung für ${selectedOffer?.restaurant || 'das Restaurant'} wurde gespeichert.`);
  };

  const handleOpenRestaurantInfo = () => {
    if (!selectedOffer) return;
    setRatingError('');
    setRatingStatus('');
    setRestaurantInfoOpen(true);
  };

  const handleCloseRestaurantInfo = () => {
    if (selectedOffer?.isRestaurantOnly) {
      handleCloseOffer();
      return;
    }
    setRestaurantInfoOpen(false);
    setRatingError('');
    setRatingStatus('');
    setReservationInfoPanelOpen(false);
    setRatingPanelOpen(false);
  };

  const handleOpenRestaurantMenu = async () => {
    const menuUrl = selectedOffer?.restaurantMenuUrl;
    if (!menuUrl) return;
    try {
      const supported = await Linking.canOpenURL(menuUrl);
      if (!supported) return;
      await Linking.openURL(menuUrl);
    } catch {
      // Ignore open failures and keep modal usable.
    }
  };

  const handleLoadDigitalMenu = async () => {
    if (!selectedOffer?.restaurantId) return;
    setDigitalMenuLoading(true);
    setDigitalMenuError('');
    try {
      const response = await getPublicRestaurantDigitalMenu(selectedOffer.restaurantId);
      const items = Array.isArray(response?.menu?.items) ? response.menu.items : [];
      setDigitalMenuItems(items);
      setDigitalMenuUpdatedAt(response?.updatedAt || null);
    } catch (error) {
      setDigitalMenuItems([]);
      setDigitalMenuUpdatedAt(null);
      setDigitalMenuError(error?.message || 'Digitales Menü konnte nicht geladen werden.');
    } finally {
      setDigitalMenuLoading(false);
    }
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
    const key = buildRestaurantRatingKey(item);
    const localRating = key ? restaurantRatings[key] : undefined;
    return (
    <Pressable
      onPress={() => handleOpenOffer(item)}
      style={({ pressed }) => [styles.offerPressable, pressed && styles.offerPressed]}
    >
      <OfferCard
        offer={item}
        distanceKm={item.distanceKm}
        ratingStars={localRating?.stars || item.restaurantRatingAverage || 0}
        ratingCount={item.restaurantRatingCount || 0}
      />
    </Pressable>
    );
  };

  const handleOpenRestaurant = () => {
    setMenuOpen(false);
    if (typeof onOpenRestaurant === 'function') {
      onOpenRestaurant();
    }
  };

  return (
    <View style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.screen}
      >
        {activeFooterTab === 'food' ? (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            renderItem={renderOffer}
            contentContainerStyle={[styles.listContent, { paddingBottom: 88 + insets.bottom }]}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              <View style={styles.heroWrap}>
                <Animated.View style={[styles.heroPanel, headerAnim]}>
                  <View style={styles.heroBackdrop}>
                    <LinearGradient
                      colors={['#8AB9FF', '#77ABFF', '#6D9EFF']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.heroOverlay}
                    />
                    <View style={styles.heroCopy}>
                      <Image source={heroIcon} style={styles.heroGraphicIcon} resizeMode="contain" />
                      <Text style={styles.heroHeading}>{selectedMealLabel}</Text>
                      <Text style={styles.heroSubheading}>Finde dein Lieblingsessen</Text>
                    </View>
                    <Pressable
                      onPress={() => setMenuOpen(true)}
                      style={({ pressed }) => [
                        styles.menuButton,
                        styles.menuButtonFloating,
                        pressed && styles.menuButtonPressed
                      ]}
                    >
                      <Ionicons name="menu" size={20} color={colors.white} />
                    </Pressable>
                    <View style={styles.heroControls}>
                      <View style={styles.mealSwitcher}>
                        {mealSlotOptions.map((option) => {
                          const active = activeMealSlot === option.key;
                          return (
                            <Pressable
                              key={option.key}
                              onPress={() => setActiveMealSlot(option.key)}
                              style={[
                                styles.mealSwitcherButton,
                                active && styles.mealSwitcherButtonActive
                              ]}
                            >
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

                      <View style={styles.inputRow}>
                        <View style={styles.inputWrap}>
                          <Ionicons name="location" size={18} color={colors.muted} />
                          <TextInput
                            placeholder="z.B. 88212"
                            keyboardType="number-pad"
                            maxLength={5}
                            value={query}
                            onChangeText={setQuery}
                            style={styles.input}
                          />
                        </View>
                        <Pressable style={styles.button} onPress={handleSearch}>
                          <Text style={styles.buttonText}>Suchen</Text>
                        </Pressable>
                      </View>

                      <View style={styles.filterRow}>
                        <FilterChip
                          label="vegan"
                          active={veganOnly}
                          onPress={() => setVeganOnly((prev) => !prev)}
                          tone="green"
                        />
                        <FilterChip
                          label="vegetarisch"
                          active={vegetarianOnly}
                          onPress={() => setVegetarianOnly((prev) => !prev)}
                          tone="gold"
                        />
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
                      </View>

                      <Text style={styles.status}>{statusText()}</Text>
                    </View>
                  </View>
                  <View style={styles.heroWaveWrap} pointerEvents="none">
                    <Svg
                      width="100%"
                      height="100%"
                      viewBox="0 0 1000 140"
                      preserveAspectRatio="none"
                      style={styles.heroWaveSvg}
                    >
                      <Path
                        d="M0 0 L1000 0 L1000 38 C850 10 680 24 520 62 C340 104 170 108 0 36 Z"
                        fill="#77ABFF"
                      />
                      <Path
                        d="M0 0 L1000 0 L1000 18 C860 0 700 10 520 34 C330 58 160 62 0 20 Z"
                        fill="rgba(138,185,255,0.65)"
                      />
                    </Svg>
                  </View>
                </Animated.View>
              </View>
            }
            ListEmptyComponent={
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>Keine Angebote</Text>
                <Text style={styles.emptyText}>
                  Noch keine Angebote gefunden. Als Restaurant anmelden und ein Angebot anlegen.
                </Text>
              </View>
            }
            ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
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
            name={activeFooterTab === 'food' ? 'home' : 'home-outline'}
            size={17}
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
          onPress={() => setActiveFooterTab('catering')}
          style={({ pressed }) => [
            styles.footerMiniButton,
            activeFooterTab === 'catering' && styles.footerMiniButtonActive,
            pressed && styles.footerMiniPressed
          ]}
        >
          <Ionicons
            name={activeFooterTab === 'catering' ? 'people' : 'people-outline'}
            size={17}
            color={activeFooterTab === 'catering' ? colors.white : colors.ink}
          />
          <Text
            style={[
              styles.footerMiniLabel,
              activeFooterTab === 'catering' && styles.footerMiniLabelActive
            ]}
          >
            Events
          </Text>
        </Pressable>
      </View>

      <Modal visible={menuOpen} transparent animationType="none" onRequestClose={() => setMenuOpen(false)}>
        <View style={styles.menuModalWrap}>
          <Pressable style={styles.menuBackdrop} onPress={() => setMenuOpen(false)}>
            <Animated.View style={[styles.menuBackdropFill, { opacity: menuOverlayOpacity }]} />
          </Pressable>

          <Animated.View style={[styles.sideMenuPanel, menuPanelStyle]}>
            <View style={styles.sideMenuHeader}>
              <View style={styles.sideMenuBrandRow}>
                <Image source={appIcon} style={styles.sideMenuBrandLogo} />
                <Text style={styles.sideMenuBrandText}>Mittagstisch bei Bundle</Text>
              </View>
              <Pressable onPress={() => setMenuOpen(false)} style={styles.sideMenuClose}>
                <Ionicons name="close" size={20} color={colors.ink} />
              </Pressable>
            </View>

            <Text style={styles.sideMenuDescription}>
              Deine Community für Frühstück, Mittagstisch und Abendessen mit schneller Vorbestellung.
            </Text>

            <Text style={styles.sideMenuHeading}>Soziale Medien</Text>
            <View style={styles.sideMenuSocialRow}>
              <View style={styles.sideMenuSocialChip}>
                <Ionicons name="logo-instagram" size={14} color={colors.ink} />
                <Text style={styles.sideMenuSocialText}>Instagram</Text>
              </View>
              <View style={styles.sideMenuSocialChip}>
                <Ionicons name="logo-facebook" size={14} color={colors.ink} />
                <Text style={styles.sideMenuSocialText}>Facebook</Text>
              </View>
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
              <Text style={styles.sideMenuImpressum}>Impressum</Text>
              <Pressable onPress={handleOpenRestaurant}>
                <Text style={styles.sideMenuRegister}>Als Restaurant registrieren</Text>
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

            <Text style={styles.filterModalLabel}>Sortierung</Text>
            <View style={styles.filterOptionsRow}>
              <Pressable
                onPress={() => setSortMode('priceAsc')}
                style={[
                  styles.filterChoice,
                  sortMode === 'priceAsc' && styles.filterChoiceActive
                ]}
              >
                <Text
                  style={[
                    styles.filterChoiceText,
                    sortMode === 'priceAsc' && styles.filterChoiceTextActive
                  ]}
                >
                  Preis aufsteigend
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setSortMode('distanceAsc')}
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
              <Pressable
                onPress={() => setSortMode('distanceDesc')}
                style={[
                  styles.filterChoice,
                  sortMode === 'distanceDesc' && styles.filterChoiceActive
                ]}
              >
                <Text
                  style={[
                    styles.filterChoiceText,
                    sortMode === 'distanceDesc' && styles.filterChoiceTextActive
                  ]}
                >
                  Weiter zuerst
                </Text>
              </Pressable>
            </View>

            <Text style={styles.filterModalLabel}>Weitere Filter</Text>
            <Pressable
              onPress={() => setPreorderOnly((prev) => !prev)}
              style={[styles.filterChoice, preorderOnly && styles.filterChoiceActive]}
            >
              <Text style={[styles.filterChoiceText, preorderOnly && styles.filterChoiceTextActive]}>
                Nur Vorbestellung
              </Text>
            </Pressable>

            <View style={styles.filterActionRow}>
              <Pressable
                onPress={() => {
                  setSortMode('none');
                  setPreorderOnly(false);
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
                      <Text style={styles.offerModalTitle}>{selectedOffer?.title}</Text>
                      <Text style={styles.offerModalMeta}>
                        {selectedOffer?.distanceKm != null
                          ? `${selectedOffer.distanceKm.toFixed(1).replace('.', ',')} km entfernt`
                          : 'Distanz unbekannt'}
                      </Text>
                    </View>
                    <Text style={styles.offerPortionText}>
                      {selectedOffer?.isRestaurantOnly ? 'Restaurant' : '1 portion'}
                    </Text>
                  </View>

                  <Pressable
                    onPress={handleOpenRestaurantInfo}
                    style={({ pressed }) => [
                      styles.offerRestaurantCard,
                      pressed && styles.offerRestaurantCardPressed
                    ]}
                  >
                    <Image source={appIcon} style={styles.offerRestaurantLogo} />
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
                          name={star <= (selectedRestaurantRating?.stars ?? 0) ? 'star' : 'star-outline'}
                          size={13}
                          color="#F59E0B"
                        />
                      ))}
                    </View>
                  </Pressable>
                  <Text style={styles.offerRestaurantHint}>
                    Tippe auf das Restaurant für Infos und Menü.
                  </Text>
                  <View style={styles.offerContactRow}>
                    <Ionicons name="call" size={16} color={colors.accent} />
                    <Text style={styles.offerContactText}>
                      {selectedOffer?.phone ? selectedOffer.phone : 'Telefon folgt'}
                    </Text>
                  </View>

                  {!selectedOffer?.isRestaurantOnly && Number.isFinite(Number(selectedOffer?.price)) ? (
                    <View style={styles.offerPriceRow}>
                      <Text style={styles.offerPriceLabel}>Preis</Text>
                      <Text style={styles.offerModalPrice}>{formatPrice(selectedOffer?.price)}</Text>
                    </View>
                  ) : null}

                  {selectedOffer?.offerId ? (
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

                  {selectedOffer?.restaurantTableReservationEnabled ? (
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
                      {reservationPanelOpen ? (
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
                                key={option.key}
                                onPress={() => setReservationDate(option.key)}
                                style={[styles.timeChip, reservationDate === option.key && styles.timeChipActive]}
                              >
                                <Text
                                  style={[
                                    styles.timeChipText,
                                    reservationDate === option.key && styles.timeChipTextActive
                                  ]}
                                >
                                  {option.label}
                                </Text>
                              </Pressable>
                            ))}
                          </ScrollView>
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
                                key={`reservation-${time}`}
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
                      ) : null}
                    </View>
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
                        <Image source={appIcon} style={styles.restaurantInfoLogo} />
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
                              name={
                                star <= (selectedRestaurantRating?.stars ?? 0)
                                  ? 'star'
                                  : 'star-outline'
                              }
                              size={16}
                              color="#F59E0B"
                            />
                          ))}
                        </View>
                        <Text style={styles.restaurantInfoRatingCaption}>
                          {selectedRestaurantRating?.stars
                            ? `${selectedRestaurantRating.stars}/5 Sterne gespeichert`
                            : 'Noch keine Bewertung gespeichert'}
                        </Text>
                      </View>

                      {selectedOffer?.restaurantMenuUrl ? (
                        <Pressable style={styles.restaurantMenuButton} onPress={handleOpenRestaurantMenu}>
                          <Ionicons name="document-text" size={16} color={colors.white} />
                          <Text style={styles.restaurantMenuButtonText}>Karte ansehen</Text>
                        </Pressable>
                      ) : null}

                      {selectedOffer?.restaurantHasDigitalMenu ? (
                        <Pressable style={styles.restaurantMenuButtonAlt} onPress={handleLoadDigitalMenu}>
                          <Ionicons name="sparkles" size={16} color={colors.ink} />
                          <Text style={styles.restaurantMenuButtonAltText}>
                            {digitalMenuLoading ? 'Lädt...' : 'Digitales Menü anzeigen'}
                          </Text>
                        </Pressable>
                      ) : null}

                      <View style={styles.offerContactRow}>
                        <Ionicons name="call" size={16} color={colors.accent} />
                        <Text style={styles.offerContactText}>
                          {selectedOffer?.phone ? selectedOffer.phone : 'Telefon folgt'}
                        </Text>
                      </View>

                      {digitalMenuError ? <Text style={styles.ratingError}>{digitalMenuError}</Text> : null}
                      {digitalMenuItems.length ? (
                        <View style={styles.publicMenuList}>
                          {digitalMenuItems.map((item) => (
                            <View key={item.id || `${item.name}-${item.price}`} style={styles.publicMenuRow}>
                              <View style={styles.publicMenuHead}>
                                <Text style={styles.publicMenuName}>{item.name}</Text>
                                <Text style={styles.publicMenuPrice}>{formatPrice(item.price)}</Text>
                              </View>
                              {item.description ? (
                                <Text style={styles.publicMenuDescription}>{item.description}</Text>
                              ) : null}
                            </View>
                          ))}
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
                        </View>
                      ) : null}

                      {selectedOffer?.restaurantTableReservationEnabled ? (
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
                          {reservationInfoPanelOpen ? (
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
                                    key={`info-${option.key}`}
                                    onPress={() => setReservationDate(option.key)}
                                    style={[styles.timeChip, reservationDate === option.key && styles.timeChipActive]}
                                  >
                                    <Text
                                      style={[
                                        styles.timeChipText,
                                        reservationDate === option.key && styles.timeChipTextActive
                                      ]}
                                    >
                                      {option.label}
                                    </Text>
                                  </Pressable>
                                ))}
                              </ScrollView>
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
                                    key={`info-reservation-${time}`}
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
                          ) : null}
                        </View>
                      ) : null}

                      <View style={[styles.ratingSection, styles.restaurantRatingSection]}>
                        <Pressable
                          style={styles.actionPanelToggle}
                          onPress={() => setRatingPanelOpen((prev) => !prev)}
                        >
                          <Text style={styles.actionPanelTitle}>
                            Bewerten
                          </Text>
                          <Ionicons
                            name={ratingPanelOpen ? 'chevron-up' : 'chevron-down'}
                            size={18}
                            color={colors.ink}
                          />
                        </Pressable>
                        {ratingPanelOpen ? (
                          <>
                            <View style={styles.ratingStarsRow}>
                              {[1, 2, 3, 4, 5].map((star) => (
                                <Pressable
                                  key={star}
                                  onPress={() => {
                                    setRatingValue(star);
                                    setRatingError('');
                                    setRatingStatus('');
                                  }}
                                  style={styles.ratingStarButton}
                                >
                                  <Ionicons
                                    name={star <= ratingValue ? 'star' : 'star-outline'}
                                    size={28}
                                    color="#F59E0B"
                                  />
                                </Pressable>
                              ))}
                            </View>
                            <TextInput
                              placeholder={`Bewerte ${selectedOffer?.restaurant || 'das Restaurant'}`}
                              value={ratingText}
                              onChangeText={setRatingText}
                              style={styles.ratingInput}
                              multiline
                              numberOfLines={3}
                              textAlignVertical="top"
                            />
                            <Pressable style={styles.ratingSubmitButton} onPress={handleSubmitRating}>
                              <Text style={styles.ratingSubmitText}>Bewertung senden</Text>
                            </Pressable>
                            {ratingError ? <Text style={styles.ratingError}>{ratingError}</Text> : null}
                            {ratingStatus ? <Text style={styles.ratingSuccess}>{ratingStatus}</Text> : null}
                          </>
                        ) : null}
                      </View>
                    </ScrollView>
                  </View>
                </KeyboardAvoidingView>
              </View>
            ) : null}
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.page
  },
  listContent: {
    padding: spacing.lg
  },
  heroWrap: {
    marginHorizontal: -spacing.lg,
    marginTop: -spacing.lg,
    marginBottom: spacing.lg
  },
  heroPanel: {
    overflow: 'hidden',
    backgroundColor: '#77ABFF'
  },
  heroBackdrop: {
    minHeight: 400,
    position: 'relative',
    justifyContent: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl + spacing.xs,
    paddingBottom: spacing.lg,
    backgroundColor: '#77ABFF'
  },
  heroWaveWrap: {
    height: 92,
    marginTop: -1,
    backgroundColor: colors.page
  },
  heroWaveSvg: {
    width: '100%',
    height: '100%'
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject
  },
  heroCopy: {
    position: 'relative',
    zIndex: 2,
    alignItems: 'center',
    justifyContent: 'center'
  },
  heroHeading: {
    fontFamily: fonts.display,
    fontSize: 34,
    lineHeight: 38,
    color: colors.white,
    marginTop: spacing.sm,
    textAlign: 'center'
  },
  heroGraphicIcon: {
    width: 184,
    height: 184
  },
  menuButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  menuButtonFloating: {
    position: 'absolute',
    top: spacing.xxl,
    right: spacing.lg,
    zIndex: 3
  },
  menuButtonPressed: {
    opacity: 0.82
  },
  heroSubheading: {
    fontFamily: fonts.bodyStrong,
    fontSize: 18,
    lineHeight: 24,
    color: colors.white,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
    textAlign: 'center'
  },
  heroControls: {
    position: 'relative',
    zIndex: 2,
    marginTop: spacing.lg
  },
  mealSwitcher: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 999,
    padding: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)'
  },
  mealSwitcherButton: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },
  mealSwitcherButtonActive: {
    backgroundColor: colors.white
  },
  mealSwitcherText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 13,
    color: 'rgba(255,255,255,0.95)'
  },
  mealSwitcherTextActive: {
    color: colors.ink
  },
  inputRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    marginTop: spacing.md
  },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.42)',
    backgroundColor: colors.white
  },
  input: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 16
  },
  button: {
    backgroundColor: colors.accentSoft,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderRadius: radius.md
  },
  buttonText: {
    fontFamily: fonts.bodyStrong,
    color: colors.ink
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md
  },
  filterOpenButton: {
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
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
    fontSize: 13,
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
    fontFamily: fonts.body,
    color: 'rgba(255,255,255,0.92)',
    marginTop: spacing.md
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
    minWidth: 82,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5
  },
  footerMiniButtonActive: {
    backgroundColor: colors.accentCool
  },
  footerMiniLabel: {
    fontFamily: fonts.bodyStrong,
    fontSize: 12,
    color: colors.ink
  },
  footerMiniLabelActive: {
    color: colors.white
  },
  footerMiniPressed: {
    opacity: 0.8
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
    color: colors.ink
  },
  sideMenuClose: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.05)'
  },
  sideMenuDescription: {
    marginTop: spacing.md,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  sideMenuImpressum: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ink
  },
  sideMenuRegister: {
    fontFamily: fonts.bodyStrong,
    fontSize: 14,
    color: '#0ea5b7'
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
  restaurantInfoNoMenu: {
    marginTop: spacing.sm,
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.muted
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
  offerContactRow: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs
  },
  offerContactText: {
    fontFamily: fonts.body,
    color: colors.ink,
    flex: 1
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
  restaurantMenuButtonText: {
    fontFamily: fonts.bodyStrong,
    color: colors.white
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
  publicMenuList: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    overflow: 'hidden'
  },
  publicMenuRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.line
  },
  publicMenuHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm
  },
  publicMenuName: {
    flex: 1,
    fontFamily: fonts.bodyStrong,
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
  publicMenuMeta: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted
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
  timeChipText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 12,
    color: colors.ink
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
  orderSuccess: {
    fontFamily: fonts.body,
    color: colors.accentCool,
    marginTop: spacing.xs
  }
});

export default UserScreen;

