import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  ImageBackground,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as SecureStore from 'expo-secure-store';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import UserScreen from './UserScreen';
import { api } from '../services/api';
import { colors, fonts, radius, shadow } from '../theme/theme';

const appIcon = require('../../assets/icon33.jpeg');
const categoryFood = require('../../assets/discovery/discovery-food.jpg');
const categoryEvents = require('../../assets/discovery/discovery-events.jpg');
const categoryMarkets = require('../../assets/discovery/discovery-markets.jpg');
const categorySport = require('../../assets/discovery/discovery-sport.jpg');
const FAVORITES_KEY = 'nahundfein.discovery.favorites.v1';
const POSTAL_CODE_KEY = 'nahundfein.discovery.postal-code.v1';

const categories = [
  {
    key: 'food',
    title: 'Essen & Restaurants',
    subtitle: 'Restaurants, Cafés & Angebote',
    image: categoryFood,
    icon: 'restaurant-outline'
  },
  {
    key: 'events',
    title: 'Freizeit & Events',
    subtitle: 'Kultur, Party & Erlebnisse',
    image: categoryEvents,
    icon: 'sparkles-outline',
    tags: ['party', 'music', 'culture', 'trip', 'family', 'workshop', 'cinema', 'other']
  },
  {
    key: 'market',
    title: 'Märkte',
    subtitle: 'Wochen- & Spezialmärkte',
    image: categoryMarkets,
    icon: 'storefront-outline',
    tags: ['market']
  },
  {
    key: 'sport',
    title: 'Sport',
    subtitle: 'Aktiv sein & mitfiebern',
    image: categorySport,
    icon: 'football-outline',
    tags: ['sport']
  }
];

const readFavorites = async () => {
  try {
    const raw = Platform.OS === 'web'
      ? globalThis.localStorage?.getItem(FAVORITES_KEY)
      : await SecureStore.getItemAsync(FAVORITES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((item) => item?.type && item?.targetId)
      : [];
  } catch {
    return [];
  }
};

const writeFavorites = async (items) => {
  const serialized = JSON.stringify(items);
  if (Platform.OS === 'web') {
    globalThis.localStorage?.setItem(FAVORITES_KEY, serialized);
    return;
  }
  await SecureStore.setItemAsync(FAVORITES_KEY, serialized);
};

const readPostalCode = async () => {
  try {
    const value = Platform.OS === 'web'
      ? globalThis.localStorage?.getItem(POSTAL_CODE_KEY)
      : await SecureStore.getItemAsync(POSTAL_CODE_KEY);
    return /^\d{5}$/.test(String(value || '')) ? String(value) : '';
  } catch {
    return '';
  }
};

const writePostalCode = async (value) => {
  if (Platform.OS === 'web') {
    globalThis.localStorage?.setItem(POSTAL_CODE_KEY, value);
    return;
  }
  await SecureStore.setItemAsync(POSTAL_CODE_KEY, value);
};

const removePostalCode = async () => {
  if (Platform.OS === 'web') {
    globalThis.localStorage?.removeItem(POSTAL_CODE_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(POSTAL_CODE_KEY);
};

const getPostalCode = (item) => {
  const direct = [
    item?.postalCode,
    item?.target?.postalCode,
    item?.target?.restaurant?.postalCode,
    item?.target?.provider?.postalCode
  ].map((value) => String(value || '').trim()).find((value) => /^\d{5}$/.test(value));
  if (direct) return direct;
  const address = [item?.address, item?.target?.address].filter(Boolean).join(' ');
  return address.match(/(?:^|\D)(\d{5})(?!\d)/)?.[1] || '';
};

const itemKey = (item) => `${item?.type || ''}:${item?.targetId || ''}`;

const formatHighlightMeta = (item) => {
  if (item?.type === 'event') {
    const date = new Date(item?.target?.occurrenceStartAt || item?.target?.startAt);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleString('de-DE', {
        weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
      });
    }
  }
  if (item?.type === 'offer' && Number.isFinite(Number(item?.target?.price))) {
    return `${Number(item.target.price).toFixed(2).replace('.', ',')} €`;
  }
  return item?.address || '';
};

const DiscoveryPreviewScreen = ({ onOpenRestaurant, eventNotification, onEventNotificationHandled }) => {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [rootTab, setRootTab] = useState('home');
  const [section, setSection] = useState(null);
  const [highlights, setHighlights] = useState([]);
  const [highlightsLoading, setHighlightsLoading] = useState(true);
  const [highlightsError, setHighlightsError] = useState('');
  const [favorites, setFavorites] = useState([]);
  const [favoriteItems, setFavoriteItems] = useState([]);
  const [favoriteFilter, setFavoriteFilter] = useState('all');
  const [selection, setSelection] = useState(null);
  const [postalCode, setPostalCode] = useState('');
  const [postalCodeDraft, setPostalCodeDraft] = useState('');
  const [postalCodeError, setPostalCodeError] = useState('');
  const [postalCodeModalVisible, setPostalCodeModalVisible] = useState(false);
  const highlightCardWidth = Math.min(width - 36, 520);
  const cityCategoryImageHeight = Math.min(172, Math.max(132, Math.round(height * 0.17)));

  const loadHighlights = useCallback(async () => {
    setHighlightsLoading(true);
    setHighlightsError('');
    try {
      const rows = await api.getHighlights();
      const next = Array.isArray(rows) ? rows : [];
      setHighlights(next);
      if (!next.length) setRootTab('city');
    } catch {
      setHighlightsError('Highlights konnten nicht geladen werden.');
      setRootTab('city');
    } finally {
      setHighlightsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHighlights();
    void readFavorites().then(setFavorites);
    void readPostalCode().then(setPostalCode);
  }, [loadHighlights]);

  useEffect(() => {
    if (!eventNotification?.id || !eventNotification?.eventId) return;
    let active = true;
    void api.getEvent(eventNotification.eventId, eventNotification.occurrenceStartAt)
      .then((event) => {
        if (!active || !event?.id) return;
        const item = {
          id: `notification:${event.id}`,
          type: 'event',
          targetId: event.id,
          title: event.title,
          subtitle: event.provider?.name || '',
          description: event.description,
          address: [event.venueName, event.address, event.postalCode].filter(Boolean).join(' · '),
          imageUrl: event.imageUrl || event.provider?.logoUrl || '',
          shareUrl: `https://app.nahundfein.com/events/${encodeURIComponent(event.id)}`,
          target: event
        };
        setSelection(item);
        setSection({ key: 'events', title: 'Event', tags: [] });
      })
      .catch(() => undefined)
      .finally(() => onEventNotificationHandled?.());
    return () => { active = false; };
  }, [eventNotification?.id]);

  useEffect(() => {
    if (!favorites.length) {
      setFavoriteItems([]);
      return;
    }
    let active = true;
    void api.resolveDiscoveryItems(favorites.map(({ type, targetId }) => ({ type, targetId })))
      .then((rows) => {
        if (!active) return;
        const byKey = new Map((Array.isArray(rows) ? rows : []).map((item) => [itemKey(item), item]));
        setFavoriteItems(favorites.map((favorite) => byKey.get(itemKey(favorite))).filter(Boolean));
      })
      .catch(() => {
        if (active) setFavoriteItems([]);
      });
    return () => { active = false; };
  }, [favorites]);

  const favoriteKeys = useMemo(() => new Set(favorites.map(itemKey)), [favorites]);
  const isFavorite = useCallback((item) => favoriteKeys.has(itemKey(item)), [favoriteKeys]);
  const filteredHighlights = useMemo(() => (
    postalCode
      ? highlights.filter((item) => getPostalCode(item) === postalCode)
      : highlights
  ), [highlights, postalCode]);
  const toggleFavorite = useCallback((item) => {
    if (!item?.type || !item?.targetId) return;
    setFavorites((current) => {
      const key = itemKey(item);
      const exists = current.some((entry) => itemKey(entry) === key);
      const next = exists
        ? current.filter((entry) => itemKey(entry) !== key)
        : [{ type: item.type, targetId: item.targetId, savedAt: new Date().toISOString() }, ...current];
      void writeFavorites(next);
      return next;
    });
  }, []);

  const openContent = (item) => {
    if (!item?.type || !item?.targetId) return;
    setSelection(item);
    setSection(item.type === 'event' ? { key: 'events', title: 'Event', tags: [] } : { key: 'food', title: item.type === 'restaurant' ? 'Restaurant' : 'Angebot' });
  };

  const openCategory = (category) => {
    Keyboard.dismiss();
    setSelection(null);
    setSection(category);
  };

  const shareItem = async (item) => {
    const text = [item?.title, item?.subtitle, item?.address, item?.shareUrl].filter(Boolean).join('\n');
    if (!text) return;
    try { await Share.share({ title: item.title || 'Nah&Fein', message: text, url: item.shareUrl || undefined }); } catch {}
  };

  const switchRoot = (next) => {
    setSection(null);
    setSelection(null);
    setRootTab(next);
  };

  const openPostalCodeDialog = () => {
    Keyboard.dismiss();
    setPostalCodeDraft(postalCode);
    setPostalCodeError('');
    setPostalCodeModalVisible(true);
  };

  const applyPostalCode = async () => {
    const value = postalCodeDraft.trim();
    if (!/^\d{5}$/.test(value)) {
      setPostalCodeError('Bitte gib eine fünfstellige PLZ ein.');
      return;
    }
    setPostalCode(value);
    setPostalCodeError('');
    setPostalCodeModalVisible(false);
    Keyboard.dismiss();
    try {
      await writePostalCode(value);
    } catch {
      setPostalCodeError('Die PLZ konnte nicht gespeichert werden.');
    }
  };

  const resetPostalCode = async () => {
    try {
      await removePostalCode();
      setPostalCode('');
      setPostalCodeDraft('');
      setPostalCodeError('');
      setPostalCodeModalVisible(false);
      Keyboard.dismiss();
    } catch {
      setPostalCodeError('Der Standort konnte nicht zurückgesetzt werden.');
    }
  };

  const renderTopHeader = ({ showBrand = false } = {}) => (
    <View style={[styles.topHeader, { paddingTop: Math.max(insets.top + 8, 18) }]}>
      <View style={styles.headerLine}>
        {showBrand ? (
          <View style={styles.brandRow}>
            <Image source={appIcon} style={styles.logo} />
            <Text style={styles.brandTitle}>Nah&Fein</Text>
          </View>
        ) : (
          <Pressable style={styles.locationChip} onPress={openPostalCodeDialog}>
            <Ionicons name="location-outline" size={15} color={colors.muted} />
            <Text style={styles.locationText}>{postalCode || 'In deiner Nähe'}</Text>
          </Pressable>
        )}
        <Pressable style={styles.partnerButton} onPress={onOpenRestaurant}>
          <Ionicons name="storefront-outline" size={16} color={colors.ink} />
          <Text style={styles.partnerButtonText}>Für Partner</Text>
        </Pressable>
      </View>
      {showBrand ? (
        <Pressable style={styles.locationChip} onPress={openPostalCodeDialog}>
          <Ionicons name="location-outline" size={15} color={colors.muted} />
          <Text style={styles.locationText}>{postalCode || 'In deiner Nähe'}</Text>
        </Pressable>
      ) : null}
    </View>
  );

  const renderHighlight = ({ item }) => {
    const content = (
      <>
        <View style={styles.highlightImageTop}>
          <View style={styles.highlightTypeBadge}>
            <Text style={styles.highlightTypeText}>
              {item.type === 'event' ? 'EVENT' : item.type === 'offer' ? 'ANGEBOT' : 'TIPP'}
            </Text>
          </View>
          <Pressable style={styles.roundAction} onPress={() => toggleFavorite(item)}>
            <Ionicons name={isFavorite(item) ? 'heart' : 'heart-outline'} size={21} color={isFavorite(item) ? colors.accentWarm : colors.ink} />
          </Pressable>
        </View>
      </>
    );
    return (
      <View style={[styles.highlightCard, { width: highlightCardWidth }]}> 
        {item.imageUrl ? (
          <ImageBackground source={{ uri: item.imageUrl }} style={styles.highlightImage} imageStyle={styles.highlightImageRadius}>
            {content}
          </ImageBackground>
        ) : (
          <LinearGradient colors={[colors.accent, colors.accentCool]} style={styles.highlightImage}>
            {content}
          </LinearGradient>
        )}
        <View style={styles.highlightCopy}>
          <View style={styles.highlightTitleRow}>
            <Text style={styles.highlightTitle} numberOfLines={2}>{item.title}</Text>
            {item.type === 'offer' && formatHighlightMeta(item) ? <Text style={styles.highlightPrice}>{formatHighlightMeta(item)}</Text> : null}
          </View>
          <Text style={styles.highlightSubtitle} numberOfLines={2}>{[item.subtitle, item.address].filter(Boolean).join(' · ') || 'Entdecke mehr in deiner Nähe'}</Text>
          {item.type !== 'offer' && formatHighlightMeta(item) ? <Text style={styles.highlightMeta}>{formatHighlightMeta(item)}</Text> : null}
          <View style={styles.highlightButtons}>
            <Pressable style={[styles.highlightPrimaryButton, (item.type === 'event' || item.type === 'offer') && styles.eventPrimaryButton]} onPress={() => openContent(item)}>
              <Text style={styles.primaryButtonText}>{item.type === 'event' ? 'Event ansehen' : item.type === 'restaurant' ? 'Zum Restaurant' : 'Mehr Details'}</Text>
              <Ionicons name="arrow-forward" size={16} color={colors.white} />
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => shareItem(item)}>
              <Text style={styles.secondaryButtonText}>Teilen</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  };

  const renderHome = () => (
    <ScrollView style={styles.rootScreen} contentContainerStyle={[styles.homeContent, { paddingBottom: 105 + insets.bottom }]} showsVerticalScrollIndicator={false}>
      {renderTopHeader({ showBrand: true })}
      <View style={styles.heroHeading}>
        <Text style={styles.heroTitle}>Was gibt’s</Text>
        <Text style={styles.heroAccent}>heute?</Text>
      </View>
      {highlightsLoading ? (
        <View style={styles.centerState}><Text style={styles.stateTitle}>Highlights werden geladen...</Text></View>
      ) : highlightsError ? (
        <View style={styles.centerState}>
          <Text style={styles.stateTitle}>{highlightsError}</Text>
          <Pressable style={styles.primaryButton} onPress={loadHighlights}><Text style={styles.primaryButtonText}>Erneut versuchen</Text></Pressable>
        </View>
      ) : (
        <View style={styles.highlightList}>
          {filteredHighlights.length ? filteredHighlights.map((item) => <View key={item.id} style={styles.highlightSpacing}>{renderHighlight({ item })}</View>) : (
            <View style={styles.emptyCard}>
              <Ionicons name="location-outline" size={30} color={colors.accent} />
              <Text style={styles.stateTitle}>Keine Highlights für {postalCode}</Text>
              <Text style={styles.stateText}>Ändere deine PLZ, um andere Highlights zu sehen.</Text>
              <Pressable style={styles.primaryButton} onPress={openPostalCodeDialog}><Text style={styles.primaryButtonText}>PLZ ändern</Text></Pressable>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );

  const renderCity = () => (
    <ScrollView style={styles.rootScreen} contentContainerStyle={[styles.cityContent, { paddingBottom: 82 + insets.bottom }]} showsVerticalScrollIndicator={false}>
      {renderTopHeader()}
      <View style={styles.cityHeading}>
        <Text style={styles.eyebrow}>MEINE STADT</Text>
        <Text style={styles.cityTitle}>Was willst du</Text>
        <Text style={styles.cityTitleAccent}>entdecken?</Text>
      </View>
      <View style={styles.categoryGrid}>
        {categories.map((category) => (
          <Pressable key={category.key} style={styles.categoryCard} onPress={() => openCategory(category)}>
            <ImageBackground source={category.image} style={[styles.categoryImage, { height: cityCategoryImageHeight }]} imageStyle={styles.categoryImageRadius}>
              <LinearGradient colors={['rgba(31,25,19,0.02)', 'rgba(31,25,19,0.32)']} style={StyleSheet.absoluteFill} />
            </ImageBackground>
            <View style={styles.categoryCardCopy}>
              <View style={styles.categoryTextCopy}>
                <Text style={styles.categoryTitle}>{category.title}</Text>
                <Text style={styles.categorySubtitle} numberOfLines={2}>{category.subtitle}</Text>
              </View>
              <View style={[styles.categoryArrow, category.key === 'food' && styles.categoryArrowActive]}>
                <Ionicons name="arrow-up" size={16} color={colors.ink} />
              </View>
            </View>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );

  const filteredFavorites = favoriteFilter === 'all'
    ? favoriteItems
    : favoriteItems.filter((item) => item.type === favoriteFilter);

  const renderFavorites = () => (
    <View style={styles.rootScreen}>
      {renderTopHeader()}
      <View style={styles.pageHeading}><Text style={styles.heroTitle}>Deine</Text><Text style={styles.heroAccent}>Favoriten.</Text></View>
      <View style={styles.favoriteFilters}>
        {[
          ['all', 'Alle'], ['restaurant', 'Restaurants'], ['offer', 'Angebote'], ['event', 'Events']
        ].map(([key, label]) => (
          <Pressable key={key} onPress={() => setFavoriteFilter(key)} style={[styles.filterChip, favoriteFilter === key && styles.filterChipActive]}>
            <Text style={[styles.filterChipText, favoriteFilter === key && styles.filterChipTextActive]}>{label}</Text>
          </Pressable>
        ))}
      </View>
      <FlatList
        data={filteredFavorites}
        keyExtractor={itemKey}
        contentContainerStyle={[styles.favoriteList, { paddingBottom: 100 + insets.bottom }]}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Ionicons name="heart-outline" size={34} color={colors.accent} />
            <Text style={styles.stateTitle}>Noch keine Favoriten</Text>
            <Text style={styles.stateText}>Tippe bei einem Highlight oder Inhalt auf das Herz.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable style={styles.favoriteCard} onPress={() => openContent(item)}>
            {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.favoriteImage} /> : <View style={styles.favoriteImageFallback}><Ionicons name="sparkles-outline" size={25} color={colors.accent} /></View>}
            <View style={styles.favoriteCopy}>
              <Text style={styles.favoriteType}>{item.type === 'event' ? 'EVENT' : item.type === 'offer' ? 'ANGEBOT' : 'RESTAURANT'}</Text>
              <Text style={styles.favoriteTitle} numberOfLines={1}>{item.title}</Text>
              <Text style={styles.favoriteSubtitle} numberOfLines={2}>{item.subtitle || item.address}</Text>
            </View>
            <Pressable style={styles.favoriteRemove} onPress={() => toggleFavorite(item)}><Ionicons name="heart" size={22} color={colors.accentWarm} /></Pressable>
          </Pressable>
        )}
      />
    </View>
  );

  const renderFooter = () => (
    <View style={styles.footer}>
      {[
        ['home', 'star-outline', 'Highlights'],
        ['city', 'compass-outline', 'Meine Stadt'],
        ['favorites', 'heart-outline', 'Favoriten']
      ].map(([key, icon, label]) => {
        const active = !section && rootTab === key;
        return (
          <Pressable key={key} onPress={() => switchRoot(key)} style={[styles.footerButton, active && styles.footerButtonActive, active && styles.footerButtonActiveWide]}>
            <Ionicons name={active ? icon.replace('-outline', '') : icon} size={20} color={colors.ink} />
            <Text style={styles.footerLabel}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  if (section) {
    return (
      <View style={styles.screen}>
        <View style={[styles.subpageHeader, { paddingTop: Math.max(insets.top, 8) }]}>
          <Pressable style={styles.backButton} onPress={() => { setSection(null); setSelection(null); setRootTab('city'); }}>
            <Ionicons name="arrow-back" size={21} color={colors.ink} />
          </Pressable>
          <Text style={styles.subpageTitle}>{section.title}</Text>
        </View>
        <View style={styles.embeddedScreen}>
          <UserScreen
            onOpenRestaurant={onOpenRestaurant}
            previewEmbedded
            initialFooterTab={section.key === 'food' ? 'food' : 'events'}
            lockedEventTags={section.tags || []}
            initialSelection={selection}
            savedItemKeys={favoriteKeys}
            onToggleSavedItem={toggleFavorite}
          />
        </View>
        {renderFooter()}
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {rootTab === 'home' ? renderHome() : rootTab === 'favorites' ? renderFavorites() : renderCity()}
      {renderFooter()}
      <Modal
        visible={postalCodeModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPostalCodeModalVisible(false)}
      >
        <View style={styles.postalModalWrap}>
          <Pressable style={styles.postalModalBackdrop} onPress={() => setPostalCodeModalVisible(false)} />
          <View style={styles.postalModalCard}>
            <Text style={styles.postalModalTitle}>Deine Nähe</Text>
            <Text style={styles.postalModalHint}>Gib deine Postleitzahl ein, um passende Highlights zu sehen.</Text>
            <TextInput
              autoFocus
              value={postalCodeDraft}
              onChangeText={(value) => {
                setPostalCodeDraft(value.replace(/\D/g, '').slice(0, 5));
                setPostalCodeError('');
              }}
              keyboardType="number-pad"
              maxLength={5}
              placeholder="PLZ"
              placeholderTextColor={colors.muted}
              style={styles.postalInput}
            />
            {postalCodeError ? <Text style={styles.postalError}>{postalCodeError}</Text> : null}
            <View style={styles.postalModalActions}>
              <Pressable style={styles.postalCancelButton} onPress={() => setPostalCodeModalVisible(false)}>
                <Text style={styles.postalCancelText}>Abbrechen</Text>
              </Pressable>
              <Pressable style={styles.postalApplyButton} onPress={applyPostalCode}>
                <Text style={styles.postalApplyText}>Übernehmen</Text>
              </Pressable>
            </View>
            {postalCode ? (
              <Pressable style={styles.postalResetButton} onPress={resetPostalCode}>
                <Text style={styles.postalResetText}>Standort zurücksetzen</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.page },
  rootScreen: { flex: 1, backgroundColor: colors.page },
  topHeader: { paddingHorizontal: 18, paddingBottom: 8, backgroundColor: colors.page, gap: 20 },
  headerLine: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logo: { width: 38, height: 38, borderRadius: 12 },
  brandTitle: { fontFamily: fonts.display, fontSize: 19, color: colors.ink },
  locationChip: { minHeight: 32, alignSelf: 'flex-start', borderRadius: 18, paddingHorizontal: 11, backgroundColor: colors.white, flexDirection: 'row', alignItems: 'center', gap: 6 },
  locationText: { fontFamily: fonts.bodyStrong, fontSize: 11, color: colors.ink },
  partnerButton: { minHeight: 38, borderRadius: 20, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.ink },
  partnerButtonText: { fontFamily: fonts.bodyStrong, fontSize: 11, color: colors.ink },
  homeContent: { paddingTop: 0 },
  heroHeading: { marginTop: 20, marginHorizontal: 18, marginBottom: 18 },
  heroTitle: { fontFamily: fonts.display, fontSize: 35, lineHeight: 39, color: colors.ink, letterSpacing: -1.2 },
  heroAccent: { alignSelf: 'flex-start', marginTop: -1, borderRadius: 9, paddingHorizontal: 7, paddingVertical: 0, backgroundColor: colors.accentCool, fontFamily: fonts.display, fontSize: 35, lineHeight: 39, color: colors.ink, letterSpacing: -1.2 },
  highlightList: { paddingHorizontal: 16 },
  highlightSpacing: { marginBottom: 14 },
  highlightCard: { alignSelf: 'center', borderRadius: radius.xl, padding: 10, overflow: 'hidden', backgroundColor: colors.white, ...shadow },
  highlightImage: { height: 196, justifyContent: 'flex-start', borderRadius: radius.lg, overflow: 'hidden' },
  highlightImageRadius: { borderRadius: radius.lg },
  highlightImageTop: { padding: 11, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  roundAction: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  highlightCopy: { paddingHorizontal: 6, paddingTop: 11, paddingBottom: 2, gap: 5 },
  highlightTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  highlightTypeBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: colors.accentWarm },
  highlightTypeText: { fontFamily: fonts.bodyStrong, fontSize: 10, color: colors.white },
  highlightTitle: { flex: 1, fontFamily: fonts.display, fontSize: 18, lineHeight: 23, color: colors.ink },
  highlightPrice: { borderRadius: 18, paddingHorizontal: 11, paddingVertical: 7, backgroundColor: colors.ink, fontFamily: fonts.bodyStrong, fontSize: 12, color: colors.accentCool },
  highlightSubtitle: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.muted },
  highlightMeta: { fontFamily: fonts.bodyStrong, fontSize: 12, color: colors.ink },
  highlightButtons: { flexDirection: 'row', gap: 8, marginTop: 8 },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 16 },
  stateTitle: { fontFamily: fonts.displaySoft, fontSize: 19, color: colors.ink, textAlign: 'center' },
  stateText: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.muted, textAlign: 'center' },
  primaryButton: { minHeight: 44, borderRadius: 24, paddingHorizontal: 20, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: colors.ink },
  highlightPrimaryButton: { flex: 1, minHeight: 44, borderRadius: 24, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: colors.ink },
  eventPrimaryButton: { backgroundColor: colors.accent },
  primaryButtonText: { fontFamily: fonts.bodyStrong, fontSize: 12, color: colors.white },
  secondaryButton: { flex: 1, minHeight: 44, borderRadius: 24, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.page },
  secondaryButtonText: { fontFamily: fonts.bodyStrong, fontSize: 12, color: colors.ink },
  cityContent: { minHeight: '100%' },
  cityHeading: { marginTop: 28, marginHorizontal: 18, marginBottom: 23 },
  eyebrow: { marginBottom: 7, fontFamily: fonts.bodyStrong, fontSize: 12, letterSpacing: 1.1, color: colors.muted },
  cityTitle: { fontFamily: fonts.display, fontSize: 35, lineHeight: 39, color: colors.ink, letterSpacing: -1.2 },
  cityTitleAccent: { alignSelf: 'flex-start', marginTop: -1, borderRadius: 9, paddingHorizontal: 7, backgroundColor: colors.accentCool, fontFamily: fonts.display, fontSize: 35, lineHeight: 39, color: colors.ink, letterSpacing: -1.2 },
  pageHeading: { marginHorizontal: 18, marginTop: 24, marginBottom: 14 },
  categoryGrid: { paddingHorizontal: 16, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  categoryCard: { width: '48%', borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colors.white, ...shadow },
  categoryImage: { height: 116 },
  categoryImageRadius: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl },
  categoryCardCopy: { minHeight: 72, paddingHorizontal: 11, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 5 },
  categoryTextCopy: { flex: 1, gap: 3 },
  categoryTitle: { fontFamily: fonts.display, fontSize: 15, lineHeight: 19, color: colors.ink },
  categorySubtitle: { fontFamily: fonts.body, fontSize: 10, lineHeight: 14, color: colors.muted },
  categoryArrow: { width: 29, height: 29, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.page, transform: [{ rotate: '45deg' }] },
  categoryArrowActive: { backgroundColor: colors.accentCool },
  favoriteFilters: { paddingHorizontal: 16, paddingVertical: 13, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterChip: { borderRadius: 18, paddingHorizontal: 13, paddingVertical: 8, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  filterChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  filterChipText: { fontFamily: fonts.bodyStrong, fontSize: 11, color: colors.ink },
  filterChipTextActive: { color: colors.white },
  favoriteList: { paddingHorizontal: 16 },
  favoriteCard: { minHeight: 94, padding: 10, borderRadius: radius.lg, backgroundColor: colors.white, flexDirection: 'row', alignItems: 'center', gap: 12, ...shadow },
  favoriteImage: { width: 76, height: 76, borderRadius: 15 },
  favoriteImageFallback: { width: 76, height: 76, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.page },
  favoriteCopy: { flex: 1, gap: 3 },
  favoriteType: { fontFamily: fonts.bodyStrong, fontSize: 9, letterSpacing: 0.8, color: colors.accent },
  favoriteTitle: { fontFamily: fonts.displaySoft, fontSize: 16, color: colors.ink },
  favoriteSubtitle: { fontFamily: fonts.body, fontSize: 11, lineHeight: 15, color: colors.muted },
  favoriteRemove: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  emptyCard: { margin: 20, minHeight: 190, borderRadius: radius.xl, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24, ...shadow },
  subpageHeader: { minHeight: 54, paddingHorizontal: 14, paddingBottom: 9, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.page, borderBottomWidth: 1, borderBottomColor: colors.line },
  backButton: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white },
  subpageTitle: { flex: 1, fontFamily: fonts.displaySoft, fontSize: 19, color: colors.ink },
  embeddedScreen: { flex: 1 },
  footer: { position: 'absolute', left: 14, right: 14, bottom: -8, minHeight: 74, padding: 7, borderRadius: 30, backgroundColor: colors.white, flexDirection: 'row', alignItems: 'center', gap: 5, ...shadow },
  footerButton: { flex: 1, minHeight: 58, borderRadius: 25, alignItems: 'center', justifyContent: 'center', gap: 3 },
  footerButtonActive: { backgroundColor: colors.accentCool },
  footerButtonActiveWide: { flex: 1.35 },
  footerLabel: { fontFamily: fonts.bodyStrong, fontSize: 10, color: colors.ink },
  postalModalWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  postalModalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(31,25,19,0.42)' },
  postalModalCard: { width: '100%', maxWidth: 380, padding: 22, borderRadius: radius.xl, backgroundColor: colors.white, gap: 12, ...shadow },
  postalModalTitle: { fontFamily: fonts.display, fontSize: 22, color: colors.ink },
  postalModalHint: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.muted },
  postalInput: { minHeight: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, fontFamily: fonts.bodyStrong, fontSize: 18, letterSpacing: 2, color: colors.ink },
  postalError: { fontFamily: fonts.body, fontSize: 12, color: colors.accentWarm },
  postalModalActions: { flexDirection: 'row', gap: 9, marginTop: 4 },
  postalCancelButton: { flex: 1, minHeight: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.page },
  postalCancelText: { fontFamily: fonts.bodyStrong, fontSize: 12, color: colors.ink },
  postalApplyButton: { flex: 1, minHeight: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentCool },
  postalApplyText: { fontFamily: fonts.bodyStrong, fontSize: 12, color: colors.ink },
  postalResetButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: colors.page },
  postalResetText: { fontFamily: fonts.bodyStrong, fontSize: 12, color: colors.ink }
});

export default DiscoveryPreviewScreen;
