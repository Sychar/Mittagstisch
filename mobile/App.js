import React, { useEffect, useState } from 'react';
import { View, Text, Image, StyleSheet, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import * as Notifications from 'expo-notifications';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold
} from '@expo-google-fonts/plus-jakarta-sans';
import UserScreen from './src/screens/UserScreen';
import RestaurantScreen from './src/screens/RestaurantScreen';
import EventLandingScreen from './src/screens/EventLandingScreen';
import OfferLandingScreen from './src/screens/OfferLandingScreen';
import DiscoveryPreviewScreen from './src/screens/DiscoveryPreviewScreen';
import { OffersProvider } from './src/store/OffersContext';
import { colors, fonts } from './src/theme/theme';
import { discoveryHomeEnabled } from './src/config/features';

const appIcon = require('./assets/icon33.jpeg');
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true
    })
  });
}

function AppShell() {
  const [activeScreen, setActiveScreen] = useState('user');
  const [eventNotification, setEventNotification] = useState(null);
  const showingRestaurant = activeScreen === 'restaurant';
  const showingPreviewDiscovery = Platform.OS === 'ios' && discoveryHomeEnabled;
  const sharedRoute = (() => {
    if (Platform.OS !== 'web' || typeof globalThis.location === 'undefined') return null;
    const legacyOfferMatch = globalThis.location.pathname.match(/^\/events\/offer\/([^/]+)\/?$/i);
    const eventMatch = globalThis.location.pathname.match(/^\/events\/([^/]+)\/?$/i);
    const offerMatch = globalThis.location.pathname.match(/^\/offers\/([^/]+)\/?$/i);
    if (!legacyOfferMatch && !eventMatch && !offerMatch) return null;
    const params = new URLSearchParams(globalThis.location.search || '');
    if (legacyOfferMatch || offerMatch) {
      return { type: 'offer', offerId: decodeURIComponent((legacyOfferMatch || offerMatch)[1]) };
    }
    return eventMatch
      ? {
          type: 'event',
          eventId: decodeURIComponent(eventMatch[1]),
          occurrenceStartAt: params.get('occurrenceStartAt') || ''
        }
      : null;
  })();

  useEffect(() => {
    if (Platform.OS === 'web') return undefined;

    const handleEventNotification = (response) => {
      const data = response?.notification?.request?.content?.data || {};
      if (data?.type !== 'event_created' || !data?.eventId) return;
      setActiveScreen('user');
      setEventNotification({
        id: `${String(data.eventId)}:${String(data.occurrenceStartAt || '')}:${Date.now()}`,
        eventId: String(data.eventId),
        occurrenceStartAt: String(data.occurrenceStartAt || '')
      });
    };

    void Notifications.getLastNotificationResponseAsync().then(handleEventNotification).catch(() => undefined);
    const subscription = Notifications.addNotificationResponseReceivedListener(handleEventNotification);
    return () => subscription.remove();
  }, []);

  const appContent = sharedRoute?.type === 'event' ? (
    <EventLandingScreen {...sharedRoute} />
  ) : sharedRoute?.type === 'offer' ? (
    <OfferLandingScreen offerId={sharedRoute.offerId} />
  ) : (
    <View style={styles.appShell}>
      {showingRestaurant ? (
        <RestaurantScreen onBack={() => setActiveScreen('user')} />
      ) : (
        showingPreviewDiscovery ? (
          <DiscoveryPreviewScreen
            onOpenRestaurant={() => setActiveScreen('restaurant')}
            eventNotification={eventNotification}
            onEventNotificationHandled={() => setEventNotification(null)}
          />
        ) : (
          <UserScreen
            onOpenRestaurant={() => setActiveScreen('restaurant')}
            eventNotification={eventNotification}
            onEventNotificationHandled={() => setEventNotification(null)}
          />
        )
      )}
    </View>
  );

  return appContent;
}

export default function App() {
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold
  });
  const [showWelcome, setShowWelcome] = useState(true);

  useEffect(() => {
    if (!fontsLoaded) return undefined;

    // Keep a short, calm handoff from the native splash to the app content.
    const timer = setTimeout(() => setShowWelcome(false), 2500);
    return () => clearTimeout(timer);
  }, [fontsLoaded]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof document === 'undefined') return;

    const html = document.documentElement;
    const body = document.body;
    if (!html || !body) return;

    const previousHtmlOverflowX = html.style.overflowX;
    const previousBodyOverflowX = body.style.overflowX;
    const previousBodyMargin = body.style.margin;
    const previousBodyWidth = body.style.width;

    html.style.overflowX = 'hidden';
    body.style.overflowX = 'hidden';
    body.style.margin = '0';
    body.style.width = '100%';

    return () => {
      html.style.overflowX = previousHtmlOverflowX;
      body.style.overflowX = previousBodyOverflowX;
      body.style.margin = previousBodyMargin;
      body.style.width = previousBodyWidth;
    };
  }, []);

  if (!fontsLoaded || showWelcome) {
    return (
      <View style={styles.welcomeScreen}>
        <View style={styles.welcomeContent}>
          <Image source={appIcon} style={styles.welcomeLogo} resizeMode="contain" />
          <Text style={styles.welcomeTitle}>Nah&amp;Fein</Text>
          <Text style={styles.welcomeSubtitle}>Essen und Events in deiner Stadt</Text>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <OffersProvider>
        <AppShell />
      </OffersProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  welcomeScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8F6FF'
  },
  welcomeContent: {
    alignItems: 'center',
    paddingHorizontal: 28
  },
  welcomeLogo: {
    width: 104,
    height: 104,
    marginBottom: 18,
    borderRadius: 26
  },
  welcomeTitle: {
    fontFamily: fonts.displaySoft,
    fontSize: 30,
    color: '#16749D',
    letterSpacing: -0.8
  },
  welcomeSubtitle: {
    marginTop: 7,
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    color: '#4B7184',
    textAlign: 'center'
  },
  appShell: {
    flex: 1,
    position: 'relative',
    backgroundColor: colors.white
  }
});
