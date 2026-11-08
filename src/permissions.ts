import {Alert, Linking, PermissionsAndroid, Platform} from 'react-native';
import Geolocation from 'react-native-geolocation-service';

function confirm(
  title: string,
  message: string,
  okLabel = 'Continue',
): Promise<boolean> {
  return new Promise(resolve => {
    Alert.alert(
      title,
      message,
      [
        {text: 'Not now', style: 'cancel', onPress: () => resolve(false)},
        {text: okLabel, onPress: () => resolve(true)},
      ],
      {cancelable: true, onDismiss: () => resolve(false)},
    );
  });
}

function offerSettings(title: string, message: string): void {
  Alert.alert(title, message, [
    {text: 'Cancel', style: 'cancel'},
    {
      text: 'Open settings',
      onPress: () => Linking.openSettings().catch(() => {}),
    },
  ]);
}

/**
 * Precise location while the app (or its foreground service) is running.
 * Background ("all the time") location is intentionally NOT requested: the
 * tracking foreground service of type `location` keeps working with
 * while-in-use permission, and it avoids Play Store background-location review.
 */
export async function ensureLocationPermission(): Promise<boolean> {
  if (Platform.OS === 'ios') {
    const result = await Geolocation.requestAuthorization('whenInUse');
    if (result !== 'granted') {
      offerSettings(
        'Location needed',
        'Allow location access in Settings so students can see the bus.',
      );
      return false;
    }
    return true;
  }

  const permission = PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION;
  if (await PermissionsAndroid.check(permission)) {
    return true;
  }
  const proceed = await confirm(
    'Share bus location',
    'While a trip is running, this app sends the bus location so students and the transport office can see it. ' +
      'Tracking stops when you end the trip.\n\nPlease choose "While using the app" and keep "Precise" on.',
  );
  if (!proceed) {
    return false;
  }
  const status = await PermissionsAndroid.request(permission);
  if (status === PermissionsAndroid.RESULTS.GRANTED) {
    return true;
  }
  if (status === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
    offerSettings(
      'Location is blocked',
      'Location permission was denied permanently. Open Settings → Permissions → Location and choose ' +
        '"Allow only while using the app" with precise location.',
    );
  } else {
    Alert.alert(
      'Location needed',
      'A trip cannot be tracked without location permission.',
    );
  }
  return false;
}

/**
 * Android 13+ needs notification permission to show the "Tracking active"
 * notification. Tracking still works without it, so this never blocks.
 */
export async function ensureNotificationPermission(): Promise<void> {
  if (Platform.OS !== 'android' || Number(Platform.Version) < 33) {
    return;
  }
  const permission = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
  if (await PermissionsAndroid.check(permission)) {
    return;
  }
  const status = await PermissionsAndroid.request(permission, {
    title: 'Show tracking notification',
    message:
      'A notification shows while the bus location is being shared, so you always know tracking is on.',
    buttonPositive: 'Allow',
  });
  if (status === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
    offerSettings(
      'Notifications are off',
      'Tracking will still work, but you will not see the "Tracking active" notification. You can enable it in Settings.',
    );
  }
}
