/**
 * ScreenSense push notifications
 * - Weekly Sunday 8pm wellbeing report
 * - Daily check-in reminder (9am)
 * - High-stress alert (triggered on demand)
 * Gracefully no-ops on web and if permissions are denied.
 */
import { Platform } from 'react-native';

let Notifications: any = null;
try {
  Notifications = require('expo-notifications');
} catch {
  // expo-notifications not installed — notifications silently disabled
}

if (Notifications) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

export async function setupNotifications(): Promise<boolean> {
  if (Platform.OS === 'web' || !Notifications) return false;
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    return finalStatus === 'granted';
  } catch {
    return false;
  }
}

/** Weekly Sunday 8pm report reminder */
export async function scheduleWeeklyReport(): Promise<void> {
  if (Platform.OS === 'web' || !Notifications) return;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '📊 ScreenSense Weekly Report',
        body: "Your 7-day wellbeing summary is ready — tap to review your week.",
        data: { screen: 'weekly' },
        sound: true,
      },
      trigger: {
        weekday: 1, // 1 = Sunday (Expo calendar convention)
        hour: 20,
        minute: 0,
        repeats: true,
      },
    });
    // Re-schedule daily reminder after cancelling all
    await _scheduleDailyReminder();
  } catch {
    // Not critical — silently fail
  }
}

/** Daily 9am check-in reminder */
async function _scheduleDailyReminder(): Promise<void> {
  if (Platform.OS === 'web' || !Notifications) return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '🌡 Daily Check-in',
        body: "How are you feeling today? A quick check-in keeps your AI predictions accurate.",
        data: { screen: 'checkin' },
        sound: true,
      },
      trigger: {
        hour: 9,
        minute: 0,
        repeats: true,
      },
    });
  } catch {}
}

/** High-stress alert — call when predicted_stress_score > 0.75 */
export async function sendHighStressAlert(stressPercent: number): Promise<void> {
  if (Platform.OS === 'web' || !Notifications) return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '⚠️ High Stress Detected',
        body: `Your stress level is at ${stressPercent}%. Consider a short breathing exercise or a walk outside.`,
        data: { screen: 'therapy' },
        sound: true,
      },
      trigger: null, // fire immediately
    });
  } catch {}
}

export async function cancelWeeklyReport(): Promise<void> {
  if (!Notifications) return;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {}
}

export async function scheduleAllNotifications(): Promise<void> {
  if (Platform.OS === 'web' || !Notifications) return;
  const granted = await setupNotifications();
  if (!granted) return;
  await cancelWeeklyReport();
  await scheduleWeeklyReport(); // includes daily reminder
}

export function addNotificationResponseListener(
  handler: (screen: string) => void,
): (() => void) | null {
  if (Platform.OS === 'web' || !Notifications) return null;
  try {
    const sub = Notifications.addNotificationResponseReceivedListener(
      (response: any) => {
        const screen = response?.notification?.request?.content?.data?.screen;
        if (screen) handler(screen);
      },
    );
    return () => sub.remove();
  } catch {
    return null;
  }
}
