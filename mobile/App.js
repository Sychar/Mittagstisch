import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold
} from '@expo-google-fonts/plus-jakarta-sans';
import UserScreen from './src/screens/UserScreen';
import RestaurantScreen from './src/screens/RestaurantScreen';
import { OffersProvider } from './src/store/OffersContext';
import { colors, fonts } from './src/theme/theme';

function AppShell() {
  const [activeScreen, setActiveScreen] = useState('user');
  const showingRestaurant = activeScreen === 'restaurant';

  return (
    <View style={styles.appShell}>
      {showingRestaurant ? (
        <RestaurantScreen onBack={() => setActiveScreen('user')} />
      ) : (
        <UserScreen onOpenRestaurant={() => setActiveScreen('restaurant')} />
      )}
    </View>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold
  });

  if (!fontsLoaded) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>Lade Schriftarten ...</Text>
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
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgTop
  },
  loadingText: {
    fontFamily: fonts.displaySoft,
    fontSize: 18,
    color: colors.ink
  },
  appShell: {
    flex: 1,
    position: 'relative',
    backgroundColor: colors.white
  }
});

