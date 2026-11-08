import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  errorMessage,
  getDriverOptions,
  getDriverTrips,
  startTrip,
} from '../api';
import {SelectField, SelectOption} from '../components/SelectModal';
import {Banner, Button, Card, SectionTitle} from '../components/ui';
import {
  ensureLocationPermission,
  ensureNotificationPermission,
} from '../permissions';
import {loadLastChoice, saveLastChoice} from '../storage';
import {colors, spacing} from '../theme';
import type {DriverOptions, DriverTrips, Trip, User} from '../types';

function formatTime(iso: string | null): string {
  if (!iso) {
    return '—';
  }
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function HomeScreen({
  user,
  onTripStarted,
  onResumeTrip,
  onLogout,
}: {
  user: User;
  onTripStarted: (trip: Trip) => void;
  onResumeTrip: (trip: Trip) => void;
  onLogout: () => void;
}) {
  const [trips, setTrips] = useState<DriverTrips | null>(null);
  const [options, setOptions] = useState<DriverOptions | null>(null);
  const [busId, setBusId] = useState<number | null>(null);
  const [routeId, setRouteId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [t, o, last] = await Promise.all([
        getDriverTrips(),
        getDriverOptions(),
        loadLastChoice(),
      ]);
      setTrips(t);
      setOptions(o);
      const lastBus = o.buses.find(b => b.id === last?.busId && !b.busy);
      setBusId(prev => prev ?? lastBus?.id ?? null);
      const lastRoute = o.routes.find(r => r.id === last?.routeId);
      setRouteId(
        prev => prev ?? lastRoute?.id ?? lastBus?.default_route_id ?? null,
      );
    } catch (e) {
      setError(errorMessage(e, 'Could not load your trips.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const busOptions: SelectOption[] = useMemo(
    () =>
      (options?.buses ?? []).map(b => ({
        id: b.id,
        label: b.registration_no,
        hint: [b.name, b.busy ? 'In use on another trip' : '']
          .filter(Boolean)
          .join(' · '),
        disabled: b.busy,
      })),
    [options],
  );
  const routeOptions: SelectOption[] = useMemo(
    () => (options?.routes ?? []).map(r => ({id: r.id, label: r.name})),
    [options],
  );

  const chooseBus = (id: number) => {
    setBusId(id);
    const bus = options?.buses.find(b => b.id === id);
    if (bus?.default_route_id) {
      setRouteId(bus.default_route_id);
    }
  };

  const begin = async (
    key: string,
    body: {trip_id: number} | {bus_id: number; route_id: number | null},
  ) => {
    if (!(await ensureLocationPermission())) {
      return;
    }
    await ensureNotificationPermission();
    setStarting(key);
    try {
      const trip = await startTrip(body);
      if ('bus_id' in body) {
        saveLastChoice({busId: body.bus_id, routeId: body.route_id});
      }
      onTripStarted(trip);
    } catch (e) {
      Alert.alert('Could not start trip', errorMessage(e));
      load();
    } finally {
      setStarting(null);
    }
  };

  const startNew = () => {
    if (!busId) {
      Alert.alert('Choose a bus', 'Select the bus you are driving.');
      return;
    }
    if (!routeId) {
      Alert.alert('Choose a route', 'Select the route for this trip.');
      return;
    }
    begin('new', {bus_id: busId, route_id: routeId});
  };

  const confirmLogout = () =>
    Alert.alert('Sign out?', 'You will need your password to sign in again.', [
      {text: 'Cancel', style: 'cancel'},
      {text: 'Sign out', style: 'destructive', onPress: onLogout},
    ]);

  const ongoing = trips?.ongoing ?? null;

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            load();
          }}
        />
      }>
      <View style={styles.header}>
        <View style={styles.flex}>
          <Text style={styles.hello}>
            Hello, {user.first_name || user.name}
          </Text>
          <Text style={styles.org}>{user.organization?.name ?? ''}</Text>
        </View>
      </View>

      {error ? <Banner text={error} tone="danger" /> : null}
      {loading ? <Text style={styles.muted}>Loading…</Text> : null}

      {ongoing ? (
        <Card style={styles.ongoing}>
          <Text style={styles.cardTitle}>Trip in progress</Text>
          <Text style={styles.cardLine}>
            {ongoing.bus.registration_no} · {ongoing.route.name}
          </Text>
          <Text style={styles.muted}>
            Started {formatTime(ongoing.start_time)}
          </Text>
          <Button
            title="RESUME TRIP"
            variant="success"
            onPress={() => onResumeTrip(ongoing)}
          />
        </Card>
      ) : null}

      {!ongoing && options ? (
        <Card>
          <SectionTitle>Start a trip</SectionTitle>
          {options.buses.length === 0 ? (
            <Text style={styles.muted}>
              No buses are set up yet. Ask your transport office.
            </Text>
          ) : (
            <>
              <SelectField
                testID="bus-select"
                label="Bus"
                placeholder="Select your bus"
                options={busOptions}
                value={busId}
                onChange={chooseBus}
              />
              <SelectField
                testID="route-select"
                label="Route"
                placeholder="Select the route"
                options={routeOptions}
                value={routeId}
                onChange={setRouteId}
              />
              <Button
                testID="start-trip"
                title="START TRIP"
                variant="success"
                onPress={startNew}
                loading={starting === 'new'}
                disabled={starting !== null}
              />
            </>
          )}
        </Card>
      ) : null}

      {!ongoing && trips && trips.scheduled.length > 0 ? (
        <Card>
          <SectionTitle>Assigned by the office</SectionTitle>
          {trips.scheduled.map(trip => (
            <View key={trip.id} style={styles.scheduled}>
              <Text style={styles.cardLine}>
                #{trip.id} · {trip.bus.registration_no} · {trip.route.name}
              </Text>
              <Button
                title="START THIS TRIP"
                variant="secondary"
                onPress={() => begin(`trip-${trip.id}`, {trip_id: trip.id})}
                loading={starting === `trip-${trip.id}`}
                disabled={starting !== null}
              />
            </View>
          ))}
        </Card>
      ) : null}

      {trips && trips.recent.length > 0 ? (
        <Card>
          <SectionTitle>Recent trips</SectionTitle>
          {trips.recent.slice(0, 5).map(trip => (
            <Text key={trip.id} style={styles.recent}>
              {formatTime(trip.start_time)} · {trip.bus.registration_no} ·{' '}
              {trip.route.name}
            </Text>
          ))}
        </Card>
      ) : null}

      <Button
        title="SIGN OUT"
        variant="secondary"
        onPress={confirmLogout}
        style={styles.logout}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {padding: spacing.lg, paddingBottom: spacing.xl * 2},
  flex: {flex: 1},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  hello: {fontSize: 24, fontWeight: '800', color: colors.text},
  org: {fontSize: 15, color: colors.muted, marginTop: 2},
  muted: {fontSize: 14, color: colors.muted, marginBottom: spacing.sm},
  ongoing: {borderColor: colors.success, borderWidth: 2},
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.success,
    marginBottom: spacing.xs,
  },
  cardLine: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  scheduled: {
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  recent: {fontSize: 14, color: colors.text, paddingVertical: spacing.xs},
  logout: {marginTop: spacing.lg},
});
