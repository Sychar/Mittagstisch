import Constants from 'expo-constants';

const manifestExtra =
  Constants?.expoConfig?.extra ||
  Constants?.manifest2?.extra?.expoClient?.extra ||
  Constants?.manifest?.extra ||
  {};

export const eventsEnabled =
  process.env.EXPO_PUBLIC_EVENTS_ENABLED === '1' ||
  manifestExtra.eventsEnabled === true ||
  manifestExtra.eventsEnabled === '1' ||
  __DEV__ === true;

// Website sync remains available for Preview research, but is intentionally
// hidden from the Production 1.0.8 release until the scanner is mature.
export const websiteSyncEnabled =
  process.env.EXPO_PUBLIC_WEBSITE_SYNC_ENABLED === '1' ||
  manifestExtra.websiteSyncEnabled === true ||
  manifestExtra.websiteSyncEnabled === '1' ||
  __DEV__ === true;

export const cateringEnabled =
  process.env.EXPO_PUBLIC_CATERING_ENABLED === '1' ||
  manifestExtra.cateringEnabled === true ||
  manifestExtra.cateringEnabled === '1' ||
  __DEV__ === true;

export const reviewReportingEnabled =
  process.env.EXPO_PUBLIC_REVIEW_REPORTING_ENABLED === '1' ||
  manifestExtra.reviewReportingEnabled === true ||
  manifestExtra.reviewReportingEnabled === '1' ||
  __DEV__ === true;

export const discoveryHomeEnabled =
  process.env.EXPO_PUBLIC_DISCOVERY_HOME_ENABLED === '1' ||
  manifestExtra.discoveryHomeEnabled === true ||
  manifestExtra.discoveryHomeEnabled === '1';
