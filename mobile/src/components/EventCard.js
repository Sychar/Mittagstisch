import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius, shadow, spacing } from '../theme/theme';
import {
  eventTagIconByKey,
  eventTagLabelByKey,
  eventThemeByTag,
  getPrimaryEventTag
} from '../events/eventConfig';

const formatEventDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Termin offen';
  return new Intl.DateTimeFormat('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
};

const eventWeekdayShortLabel = { mon: 'Mo', tue: 'Di', wed: 'Mi', thu: 'Do', fri: 'Fr', sat: 'Sa', sun: 'So' };
const eventWeekdayFullLabel = {
  mon: 'Montag',
  tue: 'Dienstag',
  wed: 'Mittwoch',
  thu: 'Donnerstag',
  fri: 'Freitag',
  sat: 'Samstag',
  sun: 'Sonntag'
};

const formatEventRecurrence = (event) => {
  if (event?.recurrenceType === 'monthly') {
    const startAt = new Date(event?.startAt);
    if (Number.isNaN(startAt.getTime())) return 'Monatlich';
    return `Monatlich · am ${startAt.getDate()}.`;
  }
  if (event?.recurrenceType !== 'weekly') return '';
  const weekdays = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].filter((day) =>
    event?.recurrenceWeekdays?.includes(day)
  );
  if (!weekdays.length) return 'Wöchentlich';
  if (weekdays.length === 1) return `Wöchentlich · jeden ${eventWeekdayFullLabel[weekdays[0]]}`;
  const labels = weekdays.map((day) => eventWeekdayShortLabel[day]);
  return `Wöchentlich · ${labels.slice(0, -1).join(', ')} und ${labels.at(-1)}`;
};

const EventCard = ({
  event,
  favorite,
  saved = false,
  onPress,
  onToggleFavorite,
  onToggleSaved,
  onPressImage,
  onShare,
  compact = false
}) => {
  const primaryTag = getPrimaryEventTag(event);
  const theme = eventThemeByTag[primaryTag] || eventThemeByTag.other;
  const tags = Array.isArray(event?.tags) && event.tags.length ? event.tags : [primaryTag];
  const providerName = event?.provider?.name || 'Anbieter';
  const venue = event?.venueName || event?.address || 'Ort folgt';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        compact && styles.cardCompact,
        pressed && styles.cardPressed
      ]}
    >
      <LinearGradient
        colors={theme.colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.visual}
      >
        <View style={[styles.orb, styles.orbLarge, { backgroundColor: theme.shape }]} />
        <View style={[styles.orb, styles.orbSmall, { backgroundColor: theme.accent }]} />
        <View style={styles.visualTopRow}>
          <View style={styles.themeBadge}>
            <Ionicons name={eventTagIconByKey[primaryTag] || theme.icon} size={15} color={colors.ink} />
            <Text style={styles.themeBadgeText}>{eventTagLabelByKey[primaryTag] || 'Event'}</Text>
          </View>
          <View style={styles.visualActions}>
            {onToggleSaved ? (
              <Pressable
                onPress={(eventPress) => {
                  eventPress.stopPropagation?.();
                  onToggleSaved?.();
                }}
                style={styles.favoriteButton}
                accessibilityLabel={saved ? 'Aus Favoriten entfernen' : 'Als Favorit speichern'}
              >
                <Ionicons name={saved ? 'heart' : 'heart-outline'} size={20} color={saved ? '#FF7A59' : colors.white} />
              </Pressable>
            ) : null}
            {onShare ? (
              <Pressable
                onPress={(eventPress) => {
                  eventPress.stopPropagation?.();
                  onShare?.();
                }}
                style={styles.shareButton}
              >
                <Ionicons name="share-social-outline" size={16} color={colors.white} />
                <Text style={styles.shareButtonText} numberOfLines={1}>Mit Freunden teilen</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={(eventPress) => {
                eventPress.stopPropagation?.();
                onToggleFavorite?.();
              }}
              style={styles.favoriteButton}
            >
              <Ionicons
                name={favorite ? 'star' : 'star-outline'}
                size={20}
                color={favorite ? '#FACC15' : colors.white}
              />
            </Pressable>
          </View>
        </View>
        <View style={styles.visualMain}>
          <View style={styles.visualIconWrap}>
            <Ionicons name={theme.icon} size={42} color={colors.white} />
          </View>
          {event?.imageUrl ? (
            <Pressable
              onPress={(eventPress) => {
                eventPress.stopPropagation?.();
                onPressImage?.(event.imageUrl);
              }}
              style={styles.eventImageButton}
            >
              <Image source={{ uri: event.imageUrl }} style={styles.eventImage} resizeMode="cover" />
            </Pressable>
          ) : null}
        </View>
      </LinearGradient>

      <View style={styles.body}>
        <Text style={styles.title}>{event?.title || 'Event'}</Text>
        <Text style={styles.provider}>{providerName}</Text>
        <View style={styles.metaRow}>
          <Ionicons name="calendar-outline" size={14} color={colors.accent} />
          <Text style={styles.metaText}>{formatEventDate(event?.occurrenceStartAt || event?.startAt)}</Text>
        </View>
        {formatEventRecurrence(event) ? (
          <View style={styles.metaRow}>
            <Ionicons name="repeat-outline" size={14} color={colors.accent} />
            <Text style={styles.recurrenceText}>{formatEventRecurrence(event)}</Text>
          </View>
        ) : null}
        <View style={styles.metaRow}>
          <Ionicons name="location-outline" size={14} color={colors.accent} />
          <Text style={styles.metaText}>{venue}</Text>
        </View>
        <View style={styles.tagRow}>
          {tags.slice(0, 4).map((tag) => (
            <Text key={tag} style={styles.tagChip}>
              #{eventTagLabelByKey[tag] || tag}
            </Text>
          ))}
        </View>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
    borderRadius: radius.xl,
    backgroundColor: colors.white,
    ...shadow
  },
  cardCompact: {
    borderRadius: radius.lg
  },
  cardPressed: {
    transform: [{ scale: 0.99 }],
    opacity: 0.96
  },
  visual: {
    minHeight: 170,
    padding: spacing.md,
    position: 'relative',
    overflow: 'hidden'
  },
  orb: {
    position: 'absolute',
    opacity: 0.28,
    borderRadius: 999
  },
  orbLarge: {
    width: 150,
    height: 150,
    right: -42,
    top: -34
  },
  orbSmall: {
    width: 82,
    height: 82,
    left: -24,
    bottom: -26
  },
  visualTopRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    columnGap: 8,
    rowGap: 8,
    zIndex: 2
  },
  themeBadge: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
    backgroundColor: 'rgba(255,255,255,0.86)'
  },
  themeBadgeText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 12,
    color: colors.ink
  },
  favoriteButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,23,42,0.25)'
  },
  visualActions: {
    flexShrink: 0,
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  shareButton: {
    minHeight: 36,
    maxWidth: 134,
    borderRadius: 18,
    paddingHorizontal: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: 'rgba(15,23,42,0.25)'
  },
  shareButtonText: {
    flexShrink: 1,
    fontFamily: fonts.bodyStrong,
    fontSize: 10,
    color: colors.white
  },
  visualMain: {
    flex: 1,
    minHeight: 104,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    zIndex: 1
  },
  visualIconWrap: {
    width: 78,
    height: 78,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)'
  },
  eventImageButton: {
    borderRadius: radius.lg
  },
  eventImage: {
    width: 124,
    height: 90,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.72)'
  },
  body: {
    padding: 18,
    gap: 9
  },
  title: {
    fontFamily: fonts.displaySoft,
    fontSize: 23,
    color: colors.ink
  },
  provider: {
    fontFamily: fonts.bodyStrong,
    fontSize: 15,
    color: colors.accent
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7
  },
  metaText: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.muted
  },
  recurrenceText: {
    flex: 1,
    fontFamily: fonts.bodyStrong,
    fontSize: 12,
    color: colors.accent
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 2
  },
  tagChip: {
    overflow: 'hidden',
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    backgroundColor: colors.page,
    fontFamily: fonts.bodyStrong,
    fontSize: 11,
    color: colors.ink
  }
});

export default EventCard;
