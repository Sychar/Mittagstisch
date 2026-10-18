const ANDROID_GOOGLE_MAPS_MIN_BUILD_VERSION = 15;

const googleMapsAndroidApiKey =
  process.env.GOOGLE_MAPS_ANDROID_API_KEY ||
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY ||
  '';
const eventsEnabled = process.env.EXPO_PUBLIC_EVENTS_ENABLED === '1';
const websiteSyncEnabled = process.env.EXPO_PUBLIC_WEBSITE_SYNC_ENABLED === '1';
const cateringEnabled = process.env.EXPO_PUBLIC_CATERING_ENABLED === '1';
const reviewReportingEnabled = process.env.EXPO_PUBLIC_REVIEW_REPORTING_ENABLED === '1';
const discoveryHomeEnabled = process.env.EXPO_PUBLIC_DISCOVERY_HOME_ENABLED === '1';
const appVersionOverride = String(process.env.EXPO_APP_VERSION_OVERRIDE || '').trim();

module.exports = ({ config }) => {
  const isAndroidEasBuild = process.env.EAS_BUILD_PLATFORM === 'android';

  if (isAndroidEasBuild && !googleMapsAndroidApiKey) {
    throw new Error(
      'GOOGLE_MAPS_ANDROID_API_KEY is required for Android builds with native Google Maps enabled.'
    );
  }

  return {
    ...config,
    ...(appVersionOverride ? { version: appVersionOverride } : {}),
    android: {
      ...config.android,
      config: googleMapsAndroidApiKey
        ? {
            ...(config.android?.config || {}),
            googleMaps: {
              ...(config.android?.config?.googleMaps || {}),
              apiKey: googleMapsAndroidApiKey
            }
          }
        : config.android?.config
    },
    extra: {
      ...(config.extra || {}),
      eventsEnabled,
      websiteSyncEnabled,
      cateringEnabled,
      reviewReportingEnabled,
      discoveryHomeEnabled,
      androidGoogleMapsMinBuildVersion: ANDROID_GOOGLE_MAPS_MIN_BUILD_VERSION
    }
  };
};
