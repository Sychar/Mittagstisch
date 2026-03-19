import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing } from '../theme/theme';
import { formatPrice } from '../store/OffersContext';

const FeatureBadge = ({ label, icon, tone }) => {
  const darkText = tone === 'vegetarian';
  return (
    <View style={styles.badgeItem}>
      <View
        style={[
          styles.badgeIconWrap,
          tone === 'vegan' && styles.badgeIconVegan,
          tone === 'vegetarian' && styles.badgeIconVegetarian,
          tone === 'classic' && styles.badgeIconClassic
        ]}
      >
        <Ionicons name={icon} size={15} color={darkText ? colors.ink : colors.white} />
      </View>
      <Text style={[styles.badgeLabel, darkText && styles.badgeLabelDark]}>{label}</Text>
    </View>
  );
};

const OfferCard = ({ offer, distanceKm, ratingStars = 0, ratingCount = 0 }) => {
  const initial = offer.title ? offer.title.slice(0, 1).toUpperCase() : 'M';
  const imageSource = offer.imageUrl || offer.imageUri;
  const hasImage = Boolean(imageSource);
  const distanceLabel = distanceKm != null ? `${distanceKm.toFixed(1).replace('.', ',')} km` : null;
  const metaLine = distanceLabel ? `${offer.postalCode || '--'} • ${distanceLabel}` : `${offer.postalCode || '--'}`;
  const hasPrice = Number.isFinite(Number(offer.price)) && Number(offer.price) > 0;
  const ratingLabel = ratingStars > 0 ? `${Number(ratingStars).toFixed(1)} / 5` : 'Keine Bewertung';
  const showClassic = !offer.isRestaurantOnly && !offer.tags?.length && !offer.preorderEnabled;
  const featureBadges = [];

  if (offer.tags?.includes('vegetarian')) {
    featureBadges.push({
      key: 'vegetarian',
      label: 'vegetarisch',
      icon: 'leaf-outline',
      tone: 'vegetarian'
    });
  }
  if (offer.preorderEnabled) {
    featureBadges.push({
      key: 'preorder',
      label: 'vorbestellbar',
      icon: 'time-outline',
      tone: 'classic'
    });
  }
  if (offer.tags?.includes('vegan')) {
    featureBadges.push({
      key: 'vegan',
      label: 'vegan',
      icon: 'leaf',
      tone: 'vegan'
    });
  }
  if (showClassic) {
    featureBadges.push({
      key: 'classic',
      label: 'klassisch',
      icon: 'restaurant-outline',
      tone: 'classic'
    });
  }

  return (
    <View style={styles.card}>
      <View style={styles.ticketTop}>
        {hasImage ? (
          <Image source={{ uri: imageSource }} style={styles.logoImage} />
        ) : (
          <Text style={styles.topInitial}>{initial}</Text>
        )}
      </View>

      <View style={styles.cutoutLeft} />
      <View style={styles.cutoutRight} />

      <View style={styles.content}>
        <View style={styles.headerRow}>
          <View style={styles.leftColumn}>
            <Text style={styles.title}>{offer.title}</Text>
            <Text style={styles.restaurant}>{offer.restaurant}</Text>
            <Text style={styles.metaLine}>{metaLine}</Text>
            <View style={styles.ratingRow}>
              <Ionicons name="star" size={12} color="#F59E0B" />
              <Text style={styles.ratingText}>
                {ratingCount > 0 ? `${ratingLabel} (${ratingCount})` : ratingLabel}
              </Text>
            </View>
          </View>

          <View style={styles.rightColumn}>
            <Text style={styles.price}>{hasPrice ? formatPrice(offer.price) : ''}</Text>
            <View style={styles.badgeColumn}>
              {featureBadges.map((badge) => (
                <FeatureBadge
                  key={badge.key}
                  label={badge.label}
                  icon={badge.icon}
                  tone={badge.tone}
                />
              ))}
            </View>
          </View>
        </View>

        {offer.description ? <Text style={styles.description}>{offer.description}</Text> : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 28,
    backgroundColor: colors.white,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 4
  },
  ticketTop: {
    height: 90,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center'
  },
  topInitial: {
    fontFamily: fonts.display,
    fontSize: 58,
    color: colors.white
  },
  logoImage: {
    width: 84,
    height: 84,
    borderRadius: 42
  },
  cutoutLeft: {
    position: 'absolute',
    top: 78,
    left: -12,
    width: 24,
    height: 24,
    borderRadius: 12,
    zIndex: 3,
    backgroundColor: colors.page
  },
  cutoutRight: {
    position: 'absolute',
    top: 78,
    right: -12,
    width: 24,
    height: 24,
    borderRadius: 12,
    zIndex: 3,
    backgroundColor: colors.page
  },
  content: {
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.sm
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm
  },
  leftColumn: {
    flex: 1,
    gap: spacing.xs
  },
  rightColumn: {
    alignItems: 'flex-end',
    gap: spacing.xs
  },
  badgeColumn: {
    alignItems: 'flex-end',
    gap: spacing.xs
  },
  badgeItem: {
    alignItems: 'center',
    minWidth: 78
  },
  badgeIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: colors.accentCool,
    alignItems: 'center',
    justifyContent: 'center'
  },
  badgeIconVegan: {
    backgroundColor: colors.accentCool
  },
  badgeIconVegetarian: {
    backgroundColor: colors.accentSoft
  },
  badgeIconClassic: {
    backgroundColor: colors.accentWarm
  },
  badgeLabel: {
    marginTop: 3,
    fontFamily: fonts.bodyStrong,
    fontSize: 10,
    color: colors.muted
  },
  badgeLabelDark: {
    color: colors.ink
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 22,
    lineHeight: 26,
    color: colors.ink,
    flex: 1
  },
  price: {
    fontFamily: fonts.bodyStrong,
    fontSize: 18,
    color: colors.accentCool
  },
  restaurant: {
    fontFamily: fonts.bodyStrong,
    color: colors.muted,
    fontSize: 16
  },
  metaLine: {
    fontFamily: fonts.body,
    color: colors.muted,
    fontSize: 14
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  ratingText: {
    fontFamily: fonts.body,
    color: colors.muted,
    fontSize: 12
  },
  description: {
    fontFamily: fonts.body,
    color: colors.ink,
    lineHeight: 22,
    fontSize: 15
  }
});

export default OfferCard;


