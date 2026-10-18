import React, { useEffect, useMemo, useState } from 'react';
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../services/api';
import { colors, fonts, radius, shadow, spacing } from '../theme/theme';

const APP_STORE_URL = 'https://apps.apple.com/de/app/nah-fein/id6760928415';
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=jetzt.mymittagstisch.app';

const formatPrice = (value) => {
  const price = Number(value);
  return Number.isFinite(price) && price > 0
    ? `${price.toFixed(2).replace('.', ',')} EUR`
    : '';
};

const OfferLandingScreen = ({ offerId }) => {
  const [offer, setOffer] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .getPublicOffer(offerId)
      .then((value) => {
        if (active) setOffer(value);
      })
      .catch(() => {
        if (active) setError('Dieses Angebot ist nicht mehr verfügbar.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [offerId]);

  const restaurant = offer?.restaurant || {};
  const locationText = useMemo(
    () => [restaurant.address, restaurant.postalCode].filter(Boolean).join(' · '),
    [restaurant.address, restaurant.postalCode]
  );
  const phoneUrl = String(restaurant.phone || '').trim().replace(/[^+\d]/g, '');

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <View style={styles.brandRow}>
        <View style={styles.brandIcon}>
          <Ionicons name="restaurant-outline" size={22} color={colors.white} />
        </View>
        <Text style={styles.brand}>Nah&amp;Fein Angebote</Text>
      </View>

      <View style={styles.card}>
        {loading ? <Text style={styles.infoText}>Angebot wird geladen...</Text> : null}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {offer ? (
          <>
            {offer.imageUrl ? <Image source={{ uri: offer.imageUrl }} style={styles.image} resizeMode="cover" /> : null}
            <View style={styles.content}>
              <View style={styles.titleRow}>
                <Text style={styles.title}>{offer.title || 'Angebot'}</Text>
                {formatPrice(offer.price) ? <Text style={styles.price}>{formatPrice(offer.price)}</Text> : null}
              </View>
              <Text style={styles.restaurant}>{restaurant.name || 'Restaurant'}</Text>
              {locationText ? (
                <View style={styles.metaRow}>
                  <Ionicons name="location-outline" size={18} color={colors.accent} />
                  <Text style={styles.metaText}>{locationText}</Text>
                </View>
              ) : null}
              {offer.description ? <Text style={styles.description}>{offer.description}</Text> : null}
              {restaurant.phone ? (
                <Pressable style={styles.contactButton} onPress={() => Linking.openURL(`tel:${phoneUrl}`)}>
                  <Ionicons name="call-outline" size={18} color={colors.white} />
                  <Text style={styles.contactButtonText}>{restaurant.phone}</Text>
                </Pressable>
              ) : null}
            </View>
          </>
        ) : null}
      </View>

      <View style={styles.installCard}>
        <Text style={styles.installTitle}>Installiere Nah&amp;Fein und entdecke Angebote in deiner Nähe.</Text>
        <Text style={styles.installText}>Öffne Angebote direkt in der App und finde weitere Restaurants in deiner Stadt.</Text>
        <View style={styles.storeRow}>
          <Pressable style={styles.storeButton} onPress={() => Linking.openURL(APP_STORE_URL)}>
            <Ionicons name="logo-apple" size={19} color={colors.white} />
            <Text style={styles.storeButtonText}>App Store</Text>
          </Pressable>
          <Pressable style={styles.storeButtonSecondary} onPress={() => Linking.openURL(PLAY_STORE_URL)}>
            <Ionicons name="logo-google-playstore" size={19} color={colors.ink} />
            <Text style={styles.storeButtonSecondaryText}>Google Play</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  screen: {
    minHeight: '100vh',
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    backgroundColor: colors.page,
    alignItems: 'center',
    gap: spacing.lg
  },
  brandRow: { width: '100%', maxWidth: 760, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  brandIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center'
  },
  brand: { fontFamily: fonts.displaySoft, fontSize: 20, color: colors.ink },
  card: { width: '100%', maxWidth: 760, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colors.white, ...shadow },
  image: { width: '100%', height: 320 },
  content: { padding: spacing.lg, gap: spacing.md },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  title: { flex: 1, fontFamily: fonts.displaySoft, fontSize: 30, color: colors.ink },
  price: { fontFamily: fonts.bodyStrong, fontSize: 18, color: colors.accent },
  restaurant: { fontFamily: fonts.bodyStrong, fontSize: 16, color: colors.accent },
  metaRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  metaText: { flex: 1, fontFamily: fonts.body, fontSize: 15, color: colors.muted },
  description: { fontFamily: fonts.body, fontSize: 16, lineHeight: 24, color: colors.ink },
  contactButton: {
    alignSelf: 'flex-start',
    minHeight: 46,
    borderRadius: 999,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  contactButtonText: { fontFamily: fonts.bodyStrong, color: colors.white },
  installCard: { width: '100%', maxWidth: 760, borderRadius: radius.xl, padding: spacing.lg, backgroundColor: colors.ink, gap: spacing.md },
  installTitle: { fontFamily: fonts.displaySoft, fontSize: 22, color: colors.white },
  installText: { fontFamily: fonts.body, lineHeight: 21, color: 'rgba(255,255,255,0.75)' },
  storeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  storeButton: { minHeight: 46, borderRadius: 999, paddingHorizontal: spacing.lg, backgroundColor: colors.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  storeButtonText: { fontFamily: fonts.bodyStrong, color: colors.white },
  storeButtonSecondary: { minHeight: 46, borderRadius: 999, paddingHorizontal: spacing.lg, backgroundColor: colors.white, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  storeButtonSecondaryText: { fontFamily: fonts.bodyStrong, color: colors.ink },
  infoText: { padding: spacing.lg, fontFamily: fonts.body, color: colors.muted },
  errorText: { padding: spacing.lg, fontFamily: fonts.bodyStrong, color: colors.accentWarm }
});

export default OfferLandingScreen;
