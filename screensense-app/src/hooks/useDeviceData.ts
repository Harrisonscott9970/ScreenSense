import { useState, useEffect } from 'react';
import * as Location from 'expo-location';

export interface DeviceData {
  screenTimeHours: number;
  sleepHours: number;
  heartRateResting: number | null;
  latitude: number | null;
  longitude: number | null;
  isLoading: boolean;
}

export function useDeviceData(): DeviceData {
  const [data, setData] = useState({ screenTimeHours: 4.0, sleepHours: 7.0, heartRateResting: null, latitude: null, longitude: null, isLoading: false });
  return data;
}
