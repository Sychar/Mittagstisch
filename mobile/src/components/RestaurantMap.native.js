import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius, spacing } from '../theme/theme';

const DEFAULT_REGION = {
  latitude: 47.7811,
  longitude: 9.6125,
  latitudeDelta: 0.12,
  longitudeDelta: 0.12
};

const getAndroidBuildVersion = () => {
  const rawVersion =
    Constants?.nativeBuildVersion ||
    Constants?.expoConfig?.android?.versionCode ||
    Constants?.manifest2?.extra?.expoClient?.android?.versionCode ||
    0;
  const version = Number(rawVersion);
  return Number.isFinite(version) ? version : 0;
};

const getAndroidMapsMinBuildVersion = () => {
  const rawVersion = Constants?.expoConfig?.extra?.androidGoogleMapsMinBuildVersion || 15;
  const version = Number(rawVersion);
  return Number.isFinite(version) ? version : 15;
};

const isAndroidGoogleMapsBuild = () =>
  Platform.OS === 'android' && getAndroidBuildVersion() >= getAndroidMapsMinBuildVersion();

const shouldRenderNativeMap = () => Platform.OS !== 'android' || isAndroidGoogleMapsBuild();

const toCoordinate = (point) => {
  const latitude = Number(point?.latitude);
  const longitude = Number(point?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
};

const createRegion = (points, initialRegion) => {
  if (initialRegion?.latitude && initialRegion?.longitude) {
    return {
      latitude: Number(initialRegion.latitude),
      longitude: Number(initialRegion.longitude),
      latitudeDelta: Number(initialRegion.latitudeDelta) || DEFAULT_REGION.latitudeDelta,
      longitudeDelta: Number(initialRegion.longitudeDelta) || DEFAULT_REGION.longitudeDelta
    };
  }

  const firstPoint = points.map(toCoordinate).find(Boolean);
  return firstPoint ? { ...DEFAULT_REGION, ...firstPoint } : DEFAULT_REGION;
};

const FallbackMap = ({ title = 'Karte wird vorbereitet', text }) => (
  <View style={styles.fallbackCard}>
    <View style={styles.iconWrap}>
      <Ionicons name="map-outline" size={24} color={colors.ink} />
    </View>
    <Text style={styles.title}>{title}</Text>
    <Text style={styles.text}>
      {text ||
        'Restaurants findest du aktuell in der Liste. Die Android-Karte wird mit dem nächsten App-Build wieder aktiviert.'}
    </Text>
  </View>
);

const RestaurantMap = ({
  points = [],
  initialRegion,
  onSelectPoint,
  regionKey,
  focusPointKey = '',
  fullScreen = false
}) => {
  const mapRef = useRef(null);
  const markerRefs = useRef(new Map());
  const [mapReady, setMapReady] = React.useState(false);
  const visiblePoints = useMemo(
    () => (Array.isArray(points) ? points.filter((point) => toCoordinate(point)) : []),
    [points]
  );
  const region = useMemo(() => createRegion(visiblePoints, initialRegion), [visiblePoints, initialRegion]);
  const coordinates = useMemo(() => visiblePoints.map(toCoordinate).filter(Boolean), [visiblePoints]);
  const focusedPoint = useMemo(
    () =>
      visiblePoints.find(
        (point) => String(point?.key || point?.restaurantId || '') === String(focusPointKey || '')
      ) || null,
    [visiblePoints, focusPointKey]
  );

  const fitVisibleCoordinates = useCallback(() => {
    if (!mapRef.current || !coordinates.length) return;

    if (coordinates.length === 1) {
      mapRef.current.animateToRegion(
        {
          ...coordinates[0],
          latitudeDelta: 0.025,
          longitudeDelta: 0.025
        },
        450
      );
      return;
    }

    mapRef.current.fitToCoordinates(coordinates, {
      edgePadding: { top: 110, right: 60, bottom: 110, left: 60 },
      animated: true
    });
  }, [coordinates]);

  useEffect(() => {
    const timer = setTimeout(fitVisibleCoordinates, 450);
    return () => clearTimeout(timer);
  }, [fitVisibleCoordinates, regionKey]);

  useEffect(() => {
    const coordinate = toCoordinate(focusedPoint);
    if (!mapReady || !mapRef.current || !coordinate) return undefined;
    mapRef.current.animateToRegion(
      {
        ...coordinate,
        latitudeDelta: 0.014,
        longitudeDelta: 0.014
      },
      420
    );
    const markerKey = String(focusedPoint?.key || focusedPoint?.restaurantId || '');
    const timer = setTimeout(() => markerRefs.current.get(markerKey)?.showCallout?.(), 460);
    return () => clearTimeout(timer);
  }, [focusedPoint, mapReady]);

  if (!shouldRenderNativeMap()) {
    return <FallbackMap />;
  }

  let MapView;
  let Marker;
  let PROVIDER_GOOGLE;
  try {
    const maps = require('react-native-maps');
    MapView = maps.default;
    Marker = maps.Marker;
    PROVIDER_GOOGLE = maps.PROVIDER_GOOGLE;
  } catch {
    return (
      <FallbackMap
        title="Karte nicht verfügbar"
        text="Die Karten-Komponente konnte nicht geladen werden. Bitte App aktualisieren."
      />
    );
  }

  return (
    <View style={[styles.mapFrame, fullScreen && styles.mapFrameFull]}>
      <MapView
        ref={mapRef}
        {...(Platform.OS === 'android' ? { provider: PROVIDER_GOOGLE } : {})}
        style={[styles.map, fullScreen && styles.mapFull]}
        initialRegion={region}
        loadingEnabled
        showsCompass
        toolbarEnabled={false}
        onMapReady={() => {
          setMapReady(true);
          fitVisibleCoordinates();
        }}
        onLayout={fitVisibleCoordinates}
      >
        {visiblePoints.map((point, index) => {
          const coordinate = toCoordinate(point);
          return (
            <Marker
              key={point.id || point.restaurantId || `${coordinate.latitude}-${coordinate.longitude}-${index}`}
              ref={(marker) => {
                const markerKey = String(point?.key || point?.restaurantId || '');
                if (markerKey && marker) markerRefs.current.set(markerKey, marker);
                if (markerKey && !marker) markerRefs.current.delete(markerKey);
              }}
              coordinate={coordinate}
              title={point.restaurant || 'Restaurant'}
              description={point.address || ''}
              onPress={() => {
                if (typeof onSelectPoint === 'function') {
                  onSelectPoint(point);
                }
              }}
            />
          );
        })}
      </MapView>
    </View>
  );
};

const styles = StyleSheet.create({
  fallbackCard: {
    minHeight: 300,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg
  },
  iconWrap: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.page,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm
  },
  title: {
    fontFamily: fonts.bodyStrong,
    fontSize: 18,
    color: colors.ink,
    textAlign: 'center'
  },
  text: {
    marginTop: spacing.xs,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
    textAlign: 'center'
  },
  mapFrame: {
    minHeight: 300,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white
  },
  mapFrameFull: {
    flex: 1,
    minHeight: 0,
    borderRadius: 0,
    borderWidth: 0
  },
  map: {
    flex: 1,
    minHeight: 300
  },
  mapFull: {
    minHeight: 0
  }
});

export default RestaurantMap;
