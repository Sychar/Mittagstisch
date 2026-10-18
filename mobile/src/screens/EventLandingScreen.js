import React, { useEffect, useMemo, useState } from 'react';
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../services/api';
import { colors, fonts, radius, shadow, spacing } from '../theme/theme';

const APP_STORE_URL = 'https://apps.apple.com/de/app/nah-fein/id6760928415';
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=jetzt.mymittagstisch.app';

const formatDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Termin folgt';
  return date.toLocaleString('de-DE', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const EventLandingScreen = ({ eventId, occurrenceStartAt }) => {
  const [event, setEvent] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .getEvent(eventId, occurrenceStartAt)
      .then((value) => {
        if (!active) return;
        setEvent(value);
        const providerId = String(value?.provider?.id || '').trim();
        if (providerId && value?.id) {
          void api.trackPublicRestaurantContentView(providerId, {
            type: 'event',
            contentId: String(value.id)
          });
        }
      })
      .catch((requestError) => {
        if (active) setError(requestError?.message || 'Event konnte nicht geladen werden.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [eventId, occurrenceStartAt]);

  const locationText = useMemo(
    () => [event?.venueName, event?.address, event?.postalCode].filter(Boolean).join(' · '),
    [event]
  );

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <View style={styles.brandRow}>
        <View style={styles.brandIcon}>
          <Ionicons name="sparkles" size={22} color={colors.white} />
        </View>
        <Text style={styles.brand}>Nah&Fein Events</Text>
      </View>

      <View style={styles.card}>
        {loading ? <Text style={styles.infoText}>Event wird geladen...</Text> : null}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {event ? (
          <>
            {event.imageUrl ? <Image source={{ uri: event.imageUrl }} style={styles.image} resizeMode="cover" /> : null}
            <View style={styles.content}>
              {event.occurrenceCancelled ? (
                <View style={styles.cancelledBox}>
                  <Ionicons name="alert-circle-outline" size={20} color={colors.accentWarm} />
                  <View style={styles.cancelledTextWrap}>
                    <Text style={styles.cancelledTitle}>Dieser Termin wurde abgesagt</Text>
                    {event.cancellationReason ? (
                      <Text style={styles.cancelledText}>{event.cancellationReason}</Text>
                    ) : null}
                  </View>
                </View>
              ) : null}
              <Text style={styles.title}>{event.title}</Text>
              <Text style={styles.provider}>{event.provider?.name || 'Anbieter'}</Text>
              <View style={styles.metaRow}>
                <Ionicons name="calendar-outline" size={18} color={colors.accent} />
                <Text style={styles.metaText}>{formatDate(event.occurrenceStartAt || event.startAt)}</Text>
              </View>
              <View style={styles.metaRow}>
                <Ionicons name="location-outline" size={18} color={colors.accent} />
                <Text style={styles.metaText}>{locationText || 'Ort folgt'}</Text>
              </View>
              <Text style={styles.description}>{event.description}</Text>
            </View>
          </>
        ) : null}
      </View>

      <View style={styles.installCard}>
        <Text style={styles.installTitle}>Installiere Nah&Fein und genieße Events in deiner Nähe.</Text>
        <Text style={styles.installText}>Öffne Events, speichere Favoriten und finde Veranstaltungen passend zu deinem Ort.</Text>
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
  brandRow: {
    width: '100%',
    maxWidth: 760,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm
  },
  brandIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center'
  },
  brand: {
    fontFamily: fonts.displaySoft,
    fontSize: 20,
    color: colors.ink
  },
  card: {
    width: '100%',
    maxWidth: 760,
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: colors.white,
    ...shadow
  },
  image: {
    width: '100%',
    height: 320
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md
  },
  title: {
    fontFamily: fonts.displaySoft,
    fontSize: 30,
    color: colors.ink
  },
  provider: {
    fontFamily: fonts.bodyStrong,
    fontSize: 16,
    color: colors.accent
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm
  },
  metaText: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.muted
  },
  description: {
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 24,
    color: colors.ink
  },
  cancelledBox: {
    borderWidth: 1,
    borderColor: 'rgba(249,115,22,0.38)',
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: 'rgba(249,115,22,0.10)',
    flexDirection: 'row',
    gap: spacing.sm
  },
  cancelledTextWrap: { flex: 1, gap: 3 },
  cancelledTitle: { fontFamily: fonts.bodyStrong, color: colors.accentWarm },
  cancelledText: { fontFamily: fonts.body, color: colors.ink },
  installCard: {
    width: '100%',
    maxWidth: 760,
    borderRadius: radius.xl,
    padding: spacing.lg,
    backgroundColor: colors.ink,
    gap: spacing.md
  },
  installTitle: {
    fontFamily: fonts.displaySoft,
    fontSize: 22,
    color: colors.white
  },
  installText: {
    fontFamily: fonts.body,
    lineHeight: 21,
    color: 'rgba(255,255,255,0.75)'
  },
  storeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  storeButton: {
    minHeight: 46,
    borderRadius: 999,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8
  },
  storeButtonText: { fontFamily: fonts.bodyStrong, color: colors.white },
  storeButtonSecondary: {
    minHeight: 46,
    borderRadius: 999,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8
  },
  storeButtonSecondaryText: { fontFamily: fonts.bodyStrong, color: colors.ink },
  infoText: { padding: spacing.lg, fontFamily: fonts.body, color: colors.muted },
  errorText: { padding: spacing.lg, fontFamily: fonts.bodyStrong, color: colors.accentWarm }
});

export default EventLandingScreen;
