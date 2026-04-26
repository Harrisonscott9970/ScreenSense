/**
 * Weekly report push notification — local scheduling via expo-notifications.
 * Fires every Sunday at 20:00 to prompt the user to review their weekly summary.
 * Gracefully no-ops on web and if permissions are denied.
 */
import { Platform } from 'react-native';

// Dynamic import guards against the package not being installed yet
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
      shouldPlaySound: false,
      shouldSetBadge: false,
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

export async function scheduleWeeklyReport(): Promise<void> {
  if (Platform.OS === 'web' || !Notifications) return;
  try {
    // Cancel any existing weekly notification to avoid duplicates
    await Notifications.cancelAllScheduledNotificationsAsync();
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'ScreenSense Weekly Report',
        body: "Your weekly wellbeing summary is ready. See how you've been doing.",
        data: { screen: 'weekly' },
      },
      trigger: {
        weekday: 1, // 1 = Sunday in Expo (ISO: 1=Sunday … 7=Saturday)
        hour: 20,
        minute: 0,
        repeats: true,
      },
    });
  } catch {
    // Notification scheduling failed — not critical
  }
}

export async function cancelWeeklyReport(): Promise<void> {
  if (!Notifications) return;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {}
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
