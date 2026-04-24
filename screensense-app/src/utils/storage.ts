/**
 * Cross-platform storage utility
 * Uses AsyncStorage — works on iOS, Android and web (via @react-native-async-storage/async-storage)
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const storage = {
  getItem: (key: string): Promise<string | null> => AsyncStorage.getItem(key).catch(() => null),
  setItem: (key: string, value: string): Promise<void> => AsyncStorage.setItem(key, value).catch(() => {}),
  removeItem: (key: string): Promise<void> => AsyncStorage.removeItem(key).catch(() => {}),
};

export default storage;
