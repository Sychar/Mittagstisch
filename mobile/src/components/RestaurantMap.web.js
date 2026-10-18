import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { colors, fonts, radius, spacing } from '../theme/theme';

const LEAFLET_MARKER_CSS_ID = 'mittagstisch-leaflet-marker-css';
const MARKER_LABEL_ZOOM = 15;

const escapeHtml = (value) =>
  String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const ensureLeafletMarkerCss = () => {
  if (typeof document === 'undefined') return;
  if (document.getElementById(LEAFLET_MARKER_CSS_ID)) return;

  const style = document.createElement('style');
  style.id = LEAFLET_MARKER_CSS_ID;
  style.innerHTML = `
    .mittagstisch-pin {
      width: 16px;
      height: 16px;
      border-radius: 999px;
      background: #14b8c5;
      border: 3px solid #ffffff;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.32);
    }

    .mittagstisch-pin-label {
      background: rgba(255, 255, 255, 0.92);
      border: 1px solid rgba(0, 0, 0, 0.09);
      border-radius: 999px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.16);
      color: #141414;
      font-size: 12px;
      font-weight: 600;
      line-height: 1;
      padding: 5px 10px;
      white-space: nowrap;
    }
  `;
  document.head.appendChild(style);
};

const markerIcon = L.divIcon({
  className: '',
  html: '<div class="mittagstisch-pin"></div>',
  iconSize: [16, 16],
  iconAnchor: [8, 8]
});

const RestaurantMap = ({ points = [], initialRegion, onSelectPoint, focusPointKey = '' }) => {
  const mapHostRef = useRef(null);
  const mapRef = useRef(null);
  const markerLayerRef = useRef(null);
  const markerRefs = useRef([]);
  const [mapLoading, setMapLoading] = useState(true);
  const [mapFailed, setMapFailed] = useState(false);
  const handleMapLayout = useCallback(() => {
    requestAnimationFrame(() => mapRef.current?.invalidateSize());
  }, []);

  useEffect(() => {
    let invalidate = null;

    const initialize = () => {
      ensureLeafletMarkerCss();

      if (!mapHostRef.current || mapRef.current) return;

      const fallbackLat = initialRegion?.latitude ?? 47.7811;
      const fallbackLng = initialRegion?.longitude ?? 9.6125;
      const map = L.map(mapHostRef.current, {
        zoomControl: true,
        attributionControl: true,
        scrollWheelZoom: true,
        preferCanvas: true
      }).setView([fallbackLat, fallbackLng], 12);

      const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        subdomains: 'abc',
        detectRetina: true,
        attribution: '&copy; OpenStreetMap contributors'
      });

      tiles.on('loading', () => {
        setMapLoading(true);
        setMapFailed(false);
      });
      tiles.on('load', () => {
        setMapLoading(false);
        setMapFailed(false);
      });
      tiles.on('tileerror', () => {
        setMapLoading(false);
        setMapFailed(true);
      });

      tiles.addTo(map);
      markerLayerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;

      invalidate = () => {
        requestAnimationFrame(() => {
          map.invalidateSize();
        });
      };
      invalidate();
      window.addEventListener('resize', invalidate);
    };

    initialize();

    return () => {
      if (invalidate) {
        window.removeEventListener('resize', invalidate);
      }
      markerLayerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [initialRegion?.latitude, initialRegion?.longitude]);

  useEffect(() => {
    const map = mapRef.current;
    const markers = markerLayerRef.current;
    if (!map || !markers) return;

    markers.clearLayers();
    markerRefs.current = [];
    const bounds = [];
    let focusedMarker = null;
    let focusedCoordinates = null;

    const syncMarkerLabels = () => {
      const showLabels = map.getZoom() >= MARKER_LABEL_ZOOM;
      markerRefs.current.forEach((marker) => {
        const tooltip = marker.getTooltip();
        if (showLabels) {
          if (!tooltip) {
            const label = marker.options?.mittagstischLabel || 'Restaurant';
            marker.bindTooltip(label, {
              permanent: true,
              direction: 'top',
              offset: [0, -12],
              className: 'mittagstisch-pin-label'
            });
          }
          marker.openTooltip();
        } else if (tooltip) {
          marker.unbindTooltip();
        }
      });
    };

    points.forEach((point) => {
      const marker = L.marker([point.latitude, point.longitude], {
        icon: markerIcon,
        mittagstischLabel: point.restaurant || 'Restaurant'
      });
      const cuisineText = Array.isArray(point?.cuisineTypes) ? point.cuisineTypes.join(', ') : '';
      const popupHtml = `<strong>${escapeHtml(point.restaurant || 'Restaurant')}</strong>${
        point.address ? `<br/>${escapeHtml(point.address)}` : ''
      }${cuisineText ? `<br/><span>Küche: ${escapeHtml(cuisineText)}</span>` : ''}`;
      marker.bindPopup(popupHtml);
      marker.on('click', () => {
        if (typeof onSelectPoint === 'function') {
          onSelectPoint(point);
        }
      });
      marker.addTo(markers);
      markerRefs.current.push(marker);
      bounds.push([point.latitude, point.longitude]);
      if (String(point?.key || point?.restaurantId || '') === String(focusPointKey || '')) {
        focusedMarker = marker;
        focusedCoordinates = [point.latitude, point.longitude];
      }
    });

    if (focusedMarker && focusedCoordinates) {
      map.setView(focusedCoordinates, 16, { animate: true });
      focusedMarker.openPopup();
    } else if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [32, 32] });
    } else if (bounds.length === 1) {
      map.setView(bounds[0], 14);
    } else if (initialRegion?.latitude && initialRegion?.longitude) {
      map.setView([initialRegion.latitude, initialRegion.longitude], 12);
    }

    syncMarkerLabels();
    map.on('zoomend', syncMarkerLabels);
    requestAnimationFrame(() => map.invalidateSize());
    return () => {
      map.off('zoomend', syncMarkerLabels);
    };
  }, [points, onSelectPoint, initialRegion?.latitude, initialRegion?.longitude, focusPointKey]);

  return (
    <View style={styles.wrap}>
      <View style={styles.mapFrame} onLayout={handleMapLayout}>
        <div ref={mapHostRef} style={styles.webMapCanvas} />
        {mapLoading ? (
          <View style={styles.mapLoadingBadge}>
            <Ionicons name="time-outline" size={14} color={colors.ink} />
            <Text style={styles.mapLoadingText}>Karte lädt ...</Text>
          </View>
        ) : null}
        {mapFailed ? (
          <View style={styles.mapErrorBadge}>
            <Ionicons name="warning-outline" size={14} color={colors.ink} />
            <Text style={styles.mapErrorText}>Kartenkacheln laden langsam</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    minHeight: 300
  },
  mapFrame: {
    flex: 1,
    minHeight: 0,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.page,
    position: 'relative'
  },
  webMapCanvas: {
    width: '100%',
    height: '100%'
  },
  mapLoadingBadge: {
    position: 'absolute',
    left: spacing.sm,
    top: spacing.sm,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  mapLoadingText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 13,
    color: colors.ink
  },
  mapErrorBadge: {
    position: 'absolute',
    left: spacing.sm,
    bottom: spacing.sm,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,235,59,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  mapErrorText: {
    fontFamily: fonts.bodyStrong,
    fontSize: 12,
    color: colors.ink
  }
});

export default RestaurantMap;
