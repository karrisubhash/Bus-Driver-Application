import React, {useCallback, useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';

import {
  getDriverTrips,
  isSessionExpired,
  logout,
  setOnSessionExpired,
  setTokens,
} from './src/api';
import {APP_NAME} from './src/config';
import HomeScreen from './src/screens/HomeScreen';
import LoginScreen from './src/screens/LoginScreen';
import TripScreen from './src/screens/TripScreen';
import {
  clearActiveTrip,
  clearAll,
  clearPingQueue,
  loadActiveTrip,
  loadSession,
  saveActiveTrip,
  saveSession,
} from './src/storage';
import {
  isTrackingRunning,
  resetTrackingStatus,
  stopTracking,
} from './src/tracking';
import {colors} from './src/theme';
import type {Session, Trip, User} from './src/types';

type Screen =
  | {name: 'loading'}
  | {name: 'login'; notice?: string | null}
  | {name: 'home'}
  | {name: 'trip'; trip: Trip};

export default function App() {
  const [screen, setScreen] = useState<Screen>({name: 'loading'});
  const [user, setUser] = useState<User | null>(null);

  const resetLocal = useCallback(async (notice: string | null) => {
    await stopTracking().catch(() => {});
    setTokens(null, null);
    await clearAll();
    resetTrackingStatus();
    setUser(null);
    setScreen({name: 'login', notice});
  }, []);

  // Refresh token rejected (expired / revoked / college deactivated).
  useEffect(() => {
    setOnSessionExpired(() => {
      resetLocal('Your session has expired. Please sign in again.');
    });
    return () => setOnSessionExpired(null);
  }, [resetLocal]);

  // Restore the session and resume an ongoing trip after an app restart.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const session = await loadSession();
      if (!session) {
        setScreen({name: 'login'});
        return;
      }
      setTokens(session.access, session.refresh);
      setUser(session.user);
      const storedTrip = await loadActiveTrip();
      try {
        const trips = await getDriverTrips();
        if (cancelled) {
          return;
        }
        if (trips.ongoing) {
          await saveActiveTrip(trips.ongoing);
          setScreen({name: 'trip', trip: trips.ongoing});
        } else {
          if (storedTrip) {
            await clearActiveTrip();
            await clearPingQueue();
          }
          if (isTrackingRunning()) {
            await stopTracking();
          }
          setScreen({name: 'home'});
        }
      } catch (error) {
        if (cancelled || isSessionExpired(error)) {
          return; // the session-expired handler already navigated
        }
        // Offline: keep tracking the stored trip; otherwise Home shows the error.
        setScreen(
          storedTrip ? {name: 'trip', trip: storedTrip} : {name: 'home'},
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onLoggedIn = useCallback(async (session: Session) => {
    setTokens(session.access, session.refresh);
    await saveSession(session);
    setUser(session.user);
    setScreen({name: 'home'});
  }, []);

  const openTrip = useCallback(async (trip: Trip) => {
    await saveActiveTrip(trip);
    setScreen({name: 'trip', trip});
  }, []);

  const onTripChanged = useCallback((trip: Trip) => {
    saveActiveTrip(trip);
  }, []);

  const onTripEnded = useCallback(async (message: string | null) => {
    await clearActiveTrip();
    await clearPingQueue();
    setScreen(current => (current.name === 'trip' ? {name: 'home'} : current));
    if (message) {
      Alert.alert('Trip stopped', message);
    }
  }, []);

  const onLogout = useCallback(async () => {
    await logout();
    await resetLocal(null);
  }, [resetLocal]);

  let content: React.ReactNode;
  switch (screen.name) {
    case 'loading':
      content = (
        <View style={styles.center}>
          <Text style={styles.brand}>{APP_NAME}</Text>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      );
      break;
    case 'login':
      content = <LoginScreen onLoggedIn={onLoggedIn} notice={screen.notice} />;
      break;
    case 'home':
      content = user ? (
        <HomeScreen
          user={user}
          onTripStarted={openTrip}
          onResumeTrip={openTrip}
          onLogout={onLogout}
        />
      ) : null;
      break;
    case 'trip':
      content = (
        <TripScreen
          key={screen.trip.id}
          initialTrip={screen.trip}
          onTripChanged={onTripChanged}
          onTripEnded={onTripEnded}
        />
      );
      break;
  }

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      <SafeAreaView style={styles.root}>{content}</SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.background},
  center: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  brand: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 16,
  },
});
