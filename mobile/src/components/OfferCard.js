import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Image, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing } from '../theme/theme';
import { formatPrice } from '../store/OffersContext';

const RESTAURANT_TIME_ZONE = 'Europe/Berlin';
const weekdayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const stopCardPress = (event) => {
  if (typeof event?.stopPropagation === 'function') event.stopPropagation();
};

const toMinutes = (value) => {
  const match = String(value || '').match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : null;
};

const getRestaurantClock = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: RESTAURANT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const valueByType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const year = Number(valueByType.year);
  const month = Number(valueByType.month);
  const day = Number(valueByType.day);
  const hour = Number(valueByType.hour) % 24;
  const minute = Number(valueByType.minute);
  const dateKey = `${valueByType.year}-${valueByType.month}-${valueByType.day}`;
  const weekday = weekdayKeys[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] || 'sun';
  const previousWeekday = weekdayKeys[(new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7] || 'sat';
  return { dateKey, weekday, previousWeekday, minutes: hour * 60 + minute };
};

const getOpeningPeriods = (entry) => {
  if (!entry?.enabled) return [];
  const source = Array.isArray(entry.periods) && entry.periods.length ? entry.periods : [entry];
  return source
    .map((period) => ({
      openMinutes: toMinutes(period?.openTime),
      closeMinutes: toMinutes(period?.closeTime)
    }))
    .filter(
      (period) =>
        period.openMinutes !== null &&
        period.closeMinutes !== null &&
        period.openMinutes !== period.closeMinutes
    );
};

export const getRestaurantOpenState = (openingHours, specialClosures) => {
  const clock = getRestaurantClock();
  const dayEntries = openingHours && typeof openingHours === 'object' ? openingHours : {};
  const hasHours = Object.values(dayEntries).some((entry) => entry?.enabled);
  if (!hasHours) return null;

  if (Array.isArray(specialClosures) && specialClosures.some((entry) => entry?.date === clock.dateKey)) {
    return { label: 'Geschlossen', isOpen: false };
  }

  const isOpenDuringOwnDay = (entry) =>
    getOpeningPeriods(entry).some(({ openMinutes, closeMinutes }) =>
      openMinutes < closeMinutes
        ? clock.minutes >= openMinutes && clock.minutes < closeMinutes
        : clock.minutes >= openMinutes
    );

  const isOpenFromPreviousNight = (entry) =>
    getOpeningPeriods(entry).some(
      ({ openMinutes, closeMinutes }) => openMinutes > closeMinutes && clock.minutes < closeMinutes
    );

  const isOpenToday = isOpenDuringOwnDay(dayEntries[clock.weekday]);
  const isOpen = isOpenToday || isOpenFromPreviousNight(dayEntries[clock.previousWeekday]);
  const openEndedToday = isOpenToday && Boolean(dayEntries[clock.weekday]?.openEnded);
  return { label: isOpen ? (openEndedToday ? 'Geöffnet · bis Ende' : 'Geöffnet') : 'Geschlossen', isOpen };
};

// A weekday filter answers whether a restaurant is open at any point on that
// weekday. It also includes the after-midnight portion of the previous day.
export const isRestaurantOpenOnWeekday = (openingHours, weekday) => {
  const dayEntries = openingHours && typeof openingHours === 'object' ? openingHours : {};
  const weekdayIndex = weekdayKeys.indexOf(weekday);
  if (weekdayIndex < 0) return false;

  const currentEntry = dayEntries[weekday];
  if (getOpeningPeriods(currentEntry).length) return true;

  const previousWeekday = weekdayKeys[(weekdayIndex + weekdayKeys.length - 1) % weekdayKeys.length];
  const previousEntry = dayEntries[previousWeekday];
  return getOpeningPeriods(previousEntry).some(
    ({ openMinutes, closeMinutes }) => openMinutes > closeMinutes
  );
};

const createFeatureChips = (offer, isRestaurantCard) => {
  const chips = [];
  const tags = Array.isArray(offer?.tags) ? offer.tags : [];
  const hasVegan = Boolean(offer?.restaurantHasVegan || tags.includes('vegan'));
  const hasVegetarian = Boolean(offer?.restaurantHasVegetarian || tags.includes('vegetarian'));

  if (isRestaurantCard && offer?.restaurantHasLunchMenu) {
    chips.push({ key: 'lunch', label: 'Mittagstisch', icon: 'sunny-outline', tone: 'lunch' });
  }
  if (hasVegan) chips.push({ key: 'vegan', label: 'Vegan', icon: 'leaf', tone: 'vegan' });
  if (hasVegetarian) {
    chips.push({ key: 'vegetarian', label: 'Vegetarisch', icon: 'leaf-outline', tone: 'vegetarian' });
  }
  if (!isRestaurantCard && offer?.preorderEnabled) {
    chips.push({ key: 'preorder', label: 'Vorbestellbar', icon: 'time-outline', tone: 'neutral' });
  }
  return chips;
};

const FeatureChip = ({ chip }) => (
  <View
    style={[
      styles.featureChip,
      chip.tone === 'lunch' && styles.featureChipLunch,
      chip.tone === 'vegan' && styles.featureChipVegan,
      chip.tone === 'vegetarian' && styles.featureChipVegetarian
    ]}
  >
    <Ionicons
      name={chip.icon}
      size={12}
      color={chip.tone === 'lunch' ? '#A84B00' : chip.tone === 'vegan' ? '#08783A' : colors.ink}
    />
    <Text
      style={[
        styles.featureChipText,
        chip.tone === 'lunch' && styles.featureChipTextLunch,
        chip.tone === 'vegan' && styles.featureChipTextVegan
      ]}
    >
      {chip.label}
    </Text>
  </View>
);

const RestaurantListCard = ({ offer, distanceKm, ratingStars, ratingCount, saved, onToggleSaved }) => {
  const restaurantLogoUrl = String(offer?.restaurantLogoUrl || '').trim();
  const hasRestaurantLogo = Boolean(restaurantLogoUrl);
  const distanceLabel = Number.isFinite(Number(distanceKm))
    ? `${Number(distanceKm).toFixed(1).replace('.', ',')} km`
    : '';
  const metaLine = [offer?.postalCode, distanceLabel].filter(Boolean).join(' • ');
  const ratingLabel = ratingStars > 0 ? `${Number(ratingStars).toFixed(1)} (${ratingCount || 0})` : 'Keine Bewertung';
  const openingState = getRestaurantOpenState(offer?.restaurantOpeningHours, offer?.restaurantSpecialClosures);
  const chips = createFeatureChips(offer, true);

  return (
    <View style={styles.restaurantCard}>
      {hasRestaurantLogo ? <Image source={{ uri: restaurantLogoUrl }} style={styles.restaurantLogo} /> : null}
      <View style={styles.restaurantCardContent}>
        <View style={styles.restaurantNameRow}>
          <Text style={styles.restaurantName} numberOfLines={1}>{offer?.restaurant || offer?.title || 'Restaurant'}</Text>
          {onToggleSaved ? (
            <Pressable
              onPress={(event) => {
                stopCardPress(event);
                onToggleSaved();
              }}
              style={styles.restaurantSaveButton}
              accessibilityLabel={saved ? 'Aus Favoriten entfernen' : 'Restaurant als Favorit speichern'}
            >
              <Ionicons name={saved ? 'heart' : 'heart-outline'} size={19} color={saved ? '#FF7A59' : colors.muted} />
            </Pressable>
          ) : null}
          <Ionicons name="chevron-forward" size={19} color={colors.muted} />
        </View>
        <View style={styles.restaurantDetailsRow}>
          {metaLine ? <Text style={styles.restaurantMeta} numberOfLines={1}>{metaLine}</Text> : null}
          {openingState ? (
            <Text style={[styles.openState, openingState.isOpen ? styles.openStateOpen : styles.openStateClosed]}>
              {openingState.label}
            </Text>
          ) : null}
        </View>
        <View style={styles.restaurantRatingRow}>
          <Ionicons name="star" size={12} color="#F59E0B" />
          <Text style={styles.restaurantRatingText}>{ratingLabel}</Text>
        </View>
        {chips.length ? (
          <View style={styles.featureChipRow}>
            {chips.map((chip) => <FeatureChip key={chip.key} chip={chip} />)}
          </View>
        ) : null}
      </View>
    </View>
  );
};

const OfferCard = ({
  offer,
  distanceKm,
  ratingStars = 0,
  ratingCount = 0,
  onPressRestaurant,
  onPressView,
  onPressShare,
  onPressMap,
  saved = false,
  onToggleSaved
}) => {
  const descriptionText = String(offer?.description || '').trim();
  const descriptionKey = `${offer?.offerId || offer?.id || offer?.restaurantId || offer?.title || 'card'}|${descriptionText}`;
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const restaurantLogoUrl = String(offer?.restaurantLogoUrl || '').trim();
  const distanceLabel = Number.isFinite(Number(distanceKm))
    ? `${Number(distanceKm).toFixed(1).replace('.', ',')} km`
    : '';
  const metaLine = [offer?.postalCode, distanceLabel].filter(Boolean).join(' • ');
  const hasPrice = Number.isFinite(Number(offer?.price)) && Number(offer.price) > 0;
  const ratingLabel = ratingStars > 0 ? `${Number(ratingStars).toFixed(1)} / 5` : 'Keine Bewertung';
  const isLunchMenu = offer?.itemSourceType === 'lunchMenu';
  const showDescriptionToggle = descriptionText.length > 160 || descriptionText.split(/\r\n|\r|\n/).length > 3;
  const featureChips = useMemo(() => createFeatureChips(offer, false), [offer]);

  useEffect(() => {
    setDescriptionExpanded(false);
  }, [descriptionKey]);

  if (offer?.isRestaurantOnly) {
    return (
      <RestaurantListCard
        offer={offer}
        distanceKm={distanceKm}
        ratingStars={ratingStars}
        ratingCount={ratingCount}
        saved={saved}
        onToggleSaved={onToggleSaved}
      />
    );
  }

  return (
    <View style={styles.offerCard}>
      <View style={styles.offerVisualTop}>
        <View style={styles.offerTypeBadge}>
          <Ionicons name={isLunchMenu ? 'sunny-outline' : 'pricetag-outline'} size={13} color={colors.white} />
          <Text style={styles.offerTypeBadgeText}>{isLunchMenu ? 'Mittagstisch' : 'Angebot'}</Text>
        </View>
        {hasPrice ? <Text style={styles.offerVisualPrice}>{formatPrice(offer.price)}</Text> : null}
        {restaurantLogoUrl ? (
          <Image source={{ uri: restaurantLogoUrl }} style={styles.offerVisualLogo} resizeMode="cover" />
        ) : (
          <View style={styles.offerVisualPlaceholder}>
            <Ionicons name="restaurant-outline" size={35} color="rgba(255,255,255,0.72)" />
          </View>
        )}
      </View>

      <View style={styles.offerContent}>
        <Text style={styles.offerTitle} numberOfLines={2}>{offer?.title || 'Angebot'}</Text>
        {onPressRestaurant ? (
          <Pressable
            onPress={(event) => {
              stopCardPress(event);
              onPressRestaurant();
            }}
            style={({ pressed }) => [styles.restaurantLinkWrap, pressed && styles.restaurantLinkPressed]}
          >
            <Text style={styles.restaurantLinkText} numberOfLines={1}>{offer?.restaurant || 'Restaurant'}</Text>
            <Ionicons name="information-circle-outline" size={14} color={colors.accentCool} />
          </Pressable>
        ) : null}
        <View style={styles.offerMetaRow}>
          {metaLine ? <Text style={styles.offerMeta} numberOfLines={1}>{metaLine}</Text> : null}
          <View style={styles.ratingRow}>
            <Ionicons name="star" size={12} color="#F59E0B" />
            <Text style={styles.ratingText}>{ratingCount > 0 ? `${ratingLabel} (${ratingCount})` : ratingLabel}</Text>
          </View>
        </View>
        {descriptionText ? (
          <View style={styles.descriptionBlock}>
            <Text
              style={styles.description}
              numberOfLines={descriptionExpanded ? undefined : 3}
              ellipsizeMode="tail"
            >
              {descriptionText}
            </Text>
            {showDescriptionToggle ? (
              <Pressable
                style={styles.descriptionToggle}
                onPress={(event) => {
                  stopCardPress(event);
                  setDescriptionExpanded((previous) => !previous);
                }}
              >
                <Text style={styles.descriptionToggleText}>{descriptionExpanded ? 'Weniger' : 'Mehr'}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        {featureChips.length ? (
          <View style={styles.featureChipRow}>
            {featureChips.map((chip) => <FeatureChip key={chip.key} chip={chip} />)}
          </View>
        ) : null}
        <View style={styles.offerActions}>
          <Pressable
            onPress={(event) => {
              stopCardPress(event);
              onPressView?.();
            }}
            style={({ pressed }) => [styles.offerPrimaryAction, pressed && styles.actionPressed]}
          >
            <Ionicons name="eye-outline" size={17} color="#17763D" />
            <Text style={styles.offerPrimaryActionText}>Ansehen</Text>
          </Pressable>
          {onPressShare ? (
            <Pressable
              onPress={(event) => {
                stopCardPress(event);
                onPressShare();
              }}
              style={({ pressed }) => [styles.offerSecondaryAction, pressed && styles.actionPressed]}
            >
              <Ionicons name="share-social-outline" size={16} color={colors.accentCool} />
              <Text style={styles.offerSecondaryActionText}>Mit Freunden teilen</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={(event) => {
              stopCardPress(event);
              onPressMap?.();
            }}
            accessibilityLabel="Restaurant auf Karte zeigen"
            style={({ pressed }) => [styles.offerIconAction, pressed && styles.actionPressed]}
          >
            <Ionicons name="location-outline" size={19} color={colors.accentCool} />
          </Pressable>
          {onToggleSaved ? (
            <Pressable
              onPress={(event) => {
                stopCardPress(event);
                onToggleSaved();
              }}
              accessibilityLabel={saved ? 'Aus Favoriten entfernen' : 'Angebot als Favorit speichern'}
              style={({ pressed }) => [styles.offerIconAction, pressed && styles.actionPressed]}
            >
              <Ionicons name={saved ? 'heart' : 'heart-outline'} size={19} color={saved ? '#FF7A59' : colors.accentCool} />
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  offerCard: {
    borderRadius: 20,
    backgroundColor: colors.white,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4
  },
  offerVisualTop: {
    minHeight: 114,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 88
  },
  offerTypeBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    backgroundColor: colors.accentWarm,
    paddingHorizontal: 9,
    paddingVertical: 5
  },
  offerTypeBadgeText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 11,
    color: colors.white
  },
  offerVisualPrice: {
    position: 'absolute',
    top: 18,
    right: 12,
    overflow: 'hidden',
    fontFamily: fonts.bodyStrong,
    fontSize: 18,
    color: '#147B3D',
    backgroundColor: colors.white,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6
  },
  offerVisualLogo: {
    width: 64,
    height: 64,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.78)',
    backgroundColor: colors.white
  },
  offerVisualPlaceholder: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center'
  },
  offerContent: {
    paddingHorizontal: spacing.md,
    paddingTop: 13,
    paddingBottom: spacing.md,
    gap: 6
  },
  offerTitle: {
    fontFamily: fonts.display,
    fontSize: 20,
    lineHeight: 24,
    color: colors.ink
  },
  restaurantLinkWrap: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: '100%'
  },
  restaurantLinkPressed: {
    opacity: 0.68
  },
  restaurantLinkText: {
    flexShrink: 1,
    fontFamily: fonts.bodyStrong,
    fontSize: 14,
    color: colors.accentCool,
    textDecorationLine: 'underline'
  },
  offerMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm
  },
  offerMeta: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.muted
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3
  },
  ratingText: {
    fontFamily: fonts.body,
    color: colors.muted,
    fontSize: 12
  },
  descriptionBlock: {
    marginTop: 3
  },
  description: {
    fontFamily: fonts.body,
    color: colors.ink,
    lineHeight: 20,
    fontSize: 14
  },
  descriptionToggle: {
    alignSelf: 'flex-start',
    marginTop: 3,
    paddingVertical: 3
  },
  descriptionToggleText: {
    fontFamily: fonts.bodyStrong,
    color: colors.accent,
    fontSize: 12
  },
  featureChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 2
  },
  featureChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#EEF2F7',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  featureChipLunch: {
    backgroundColor: '#FFE4C5'
  },
  featureChipVegan: {
    backgroundColor: '#DDF7E8'
  },
  featureChipVegetarian: {
    backgroundColor: '#FFF0BD'
  },
  featureChipText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 11,
    color: colors.ink
  },
  featureChipTextLunch: {
    color: '#A84B00'
  },
  featureChipTextVegan: {
    color: '#08783A'
  },
  offerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 6
  },
  offerPrimaryAction: {
    minHeight: 40,
    flex: 0.9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: '#E2F5E8',
    borderRadius: 11,
    paddingHorizontal: 8
  },
  offerPrimaryActionText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 13,
    color: '#17763D'
  },
  offerSecondaryAction: {
    minHeight: 40,
    flex: 1.28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: 11,
    backgroundColor: '#F1F6FB',
    paddingHorizontal: 7
  },
  offerSecondaryActionText: {
    flexShrink: 1,
    fontFamily: fonts.bodyStrong,
    fontSize: 12,
    color: colors.accentCool
  },
  offerIconAction: {
    width: 42,
    height: 40,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F6FB'
  },
  actionPressed: {
    opacity: 0.66
  },
  restaurantCard: {
    minHeight: 104,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E3E8EF',
    backgroundColor: colors.white,
    padding: 11,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2
  },
  restaurantLogo: {
    width: 60,
    height: 60,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#E3E8EF',
    backgroundColor: colors.page
  },
  restaurantCardContent: {
    flex: 1,
    minWidth: 0,
    gap: 4
  },
  restaurantNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  restaurantName: {
    flex: 1,
    fontFamily: fonts.display,
    fontSize: 17,
    lineHeight: 21,
    color: colors.ink
  },
  restaurantSaveButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F7F9FC'
  },
  restaurantDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7
  },
  restaurantMeta: {
    flexShrink: 1,
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.muted
  },
  openState: {
    fontFamily: fonts.bodyStrong,
    fontSize: 12
  },
  openStateOpen: {
    color: '#168143'
  },
  openStateClosed: {
    color: '#8B5E4B'
  },
  restaurantRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3
  },
  restaurantRatingText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted
  }
});

export default OfferCard;
