/**
 * useDeviceData — real device signals for ScreenSense check-in
 * =============================================================
 * Collects GPS coordinates with permission handling.
 * Screen time is tracked at App.tsx level and passed as a prop.
 * Sleep hours are collected via the check-in slider.
 */
import { useState, useEffect } from 'react';
import * as Location from 'expo-location';

export interface DeviceData {
  latitude: number | null;
  longitude: number | null;
  locationLabel: string;
  isLoadingLocation: boolean;
  locationError: string | null;
  requestLocation: () => Promise<void>;
}

export function useDeviceData(): DeviceData {
  const [latitude, setLatitude]               = useState<number | null>(null);
  const [longitude, setLongitude]             = useState<number | null>(null);
  const [locationLabel, setLocationLabel]     = useState('Waiting for location…');
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const [locationError, setLocationError]     = useState<string | null>(null);

  const requestLocation = async () => {
    setIsLoadingLocation(true);
    setLocationError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationLabel('Location permission denied');
        setLocationError('Location access was denied. Place recommendations will not be available.');
        setIsLoadingLocation(false);
        return;
      }
      setLocationLabel('Getting your location…');
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setLatitude(loc.coords.latitude);
      setLongitude(loc.coords.longitude);
      // Reverse geocode to get human-readable area name
      try {
        const [geo] = await Location.reverseGeocodeAsync(
          { latitude: loc.coords.latitude, longitude: loc.coords.longitude },
        );
        const area = geo?.district || geo?.subregion || geo?.city || geo?.region || 'your area';
        setLocationLabel(area);
      } catch {
        setLocationLabel('Location acquired');
      }
    } catch {
      setLocationError('Could not get location. Check GPS settings.');
      setLocationLabel('Location unavailable');
    } finally {
      setIsLoadingLocation(false);
    }
  };

  // Auto-request on mount
  useEffect(() => { requestLocation(); }, []);

  return { latitude, longitude, locationLabel, isLoadingLocation, locationError, requestLocation };
}
