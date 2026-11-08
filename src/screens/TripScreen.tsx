import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  endTrip,
  errorMessage,
  errorStatus,
  reportIssue,
  resolveIssue,
} from '../api';
import {Banner, Button, Card, SectionTitle} from '../components/ui';
import {
  ensureLocationPermission,
  ensureNotificationPermission,
} from '../permissions';
import {
  flushNow,
  getTrackingStatus,
  isTrackingRunning,
  startTracking,
  stopTracking,
  subscribeTracking,
  TrackingStatus,
} from '../tracking';
import {colors, radius, spacing, TOUCH} from '../theme';
import type {Trip} from '../types';

const ISSUE_OPTIONS = ['Breakdown', 'Traffic delay', 'Accident', 'Other'];

export function relativeTime(ms: number | null, now: number): string {
  if (!ms) {
    return 'not yet';
  }
  const seconds = Math.max(0, Math.round((now - ms) / 1000));
  if (seconds < 60) {
    return `${seconds}s ago`;
  }
  const minutes = Math.round(seconds / 60);
  return minutes < 60
    ? `${minutes} min ago`
    : `${Math.round(minutes / 60)} h ago`;
}

export default function TripScreen({
  initialTrip,
  onTripChanged,
  onTripEnded,
}: {
  initialTrip: Trip;
  onTripChanged: (trip: Trip) => void;
  onTripEnded: (message: string | null) => void;
}) {
  const [trip, setTrip] = useState<Trip>(initialTrip);
  const [tracking, setTracking] = useState<TrackingStatus>(getTrackingStatus());
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState<
    null | 'end' | 'issue' | 'resolve' | 'start'
  >(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [issueOpen, setIssueOpen] = useState(false);
  const [issueType, setIssueType] = useState(ISSUE_OPTIONS[0]);
  const [issueText, setIssueText] = useState('');
  const endedRef = useRef(false);

  const applyTrip = useCallback(
    (next: Trip) => {
      setTrip(next);
      onTripChanged(next);
    },
    [onTripChanged],
  );

  const beginTracking = useCallback(
    async (askPermission: boolean) => {
      setStartError(null);
      if (askPermission && !(await ensureLocationPermission())) {
        setStartError(
          'Location permission is needed to share the bus location.',
        );
        return;
      }
      if (askPermission) {
        await ensureNotificationPermission();
      }
      try {
        await startTracking(trip.id);
      } catch (e) {
        setStartError(
          `Could not start location sharing. ${errorMessage(e, '')}`.trim(),
        );
      }
    },
    [trip.id],
  );

  // Start (or resume after an app restart) the background service. If it is
  // still running for a different (stale) trip, startTracking() replaces it.
  useEffect(() => {
    if (!isTrackingRunning() || getTrackingStatus().tripId !== trip.id) {
      beginTracking(false);
    }
  }, [beginTracking, trip.id]);

  useEffect(() => subscribeTracking(setTracking), []);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Server refused pings: trip was ended by the office / auto-closed / reassigned.
  useEffect(() => {
    if (
      tracking.stoppedReason &&
      tracking.tripId === trip.id &&
      !endedRef.current
    ) {
      endedRef.current = true;
      stopTracking().finally(() => onTripEnded(tracking.stoppedReason));
    }
  }, [tracking.stoppedReason, tracking.tripId, trip.id, onTripEnded]);

  const finishTrip = async () => {
    setBusy('end');
    await flushNow(trip.id).catch(() => {});
    try {
      await endTrip(trip.id);
    } catch (e) {
      const code = errorStatus(e);
      if (code !== 403 && code !== 404 && code !== 409) {
        setBusy(null);
        Alert.alert(
          'Could not end trip',
          `${errorMessage(e)}\n\nLocation sharing is still on. Try again.`,
        );
        return;
      }
      // Already closed on the server: just stop locally.
    }
    endedRef.current = true;
    await stopTracking();
    setBusy(null);
    onTripEnded(null);
  };

  const confirmEnd = () =>
    Alert.alert(
      'End this trip?',
      'Location sharing will stop and students will see the bus as finished.',
      [
        {text: 'Cancel', style: 'cancel'},
        {text: 'End trip', style: 'destructive', onPress: finishTrip},
      ],
    );

  const submitIssue = async () => {
    const text =
      issueType === 'Other'
        ? issueText.trim() || 'Other issue'
        : [issueType, issueText.trim()].filter(Boolean).join(': ');
    setBusy('issue');
    try {
      applyTrip(await reportIssue(trip.id, text.slice(0, 500)));
      setIssueOpen(false);
      setIssueText('');
      Alert.alert(
        'Issue reported',
        'The transport office and students have been notified.',
      );
    } catch (e) {
      Alert.alert('Could not report issue', errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const markResolved = async () => {
    setBusy('resolve');
    try {
      applyTrip(await resolveIssue(trip.id));
    } catch (e) {
      Alert.alert('Could not update', errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const live = tracking.running && tracking.tripId === trip.id;
  const lastSentAge = tracking.lastSentAt ? now - tracking.lastSentAt : null;
  const stale = live && (lastSentAge === null || lastSentAge > 60_000);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Card>
        <Text style={styles.bus}>{trip.bus.registration_no}</Text>
        <Text style={styles.route}>{trip.route.name}</Text>
        {trip.start_time ? (
          <Text style={styles.muted}>
            Started{' '}
            {new Date(trip.start_time).toLocaleTimeString(undefined, {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        ) : null}
      </Card>

      {trip.has_issue ? (
        <Banner
          tone="warning"
          text={`Issue reported: ${trip.issue_text || 'Issue'}`}
        />
      ) : null}
      {startError ? <Banner tone="danger" text={startError} /> : null}
      {tracking.networkError && live ? (
        <Banner tone="warning" text={tracking.networkError} />
      ) : null}
      {tracking.gpsError && live ? (
        <Banner tone="warning" text={tracking.gpsError} />
      ) : null}

      <Card>
        <View style={styles.statusRow}>
          <View
            style={[
              styles.dot,
              {
                backgroundColor: live
                  ? stale
                    ? colors.warning
                    : colors.success
                  : colors.danger,
              },
            ]}
          />
          <Text style={styles.statusText} testID="tracking-status">
            {live
              ? stale
                ? 'Sharing location (waiting for signal)'
                : 'Sharing location'
              : 'Location sharing is OFF'}
          </Text>
        </View>
        <View style={styles.grid}>
          <Stat
            label="Last sent"
            value={relativeTime(tracking.lastSentAt, now)}
          />
          <Stat
            label="GPS accuracy"
            value={
              tracking.accuracy !== null
                ? `±${Math.round(tracking.accuracy)} m`
                : '—'
            }
          />
          <Stat label="Waiting to upload" value={String(tracking.queued)} />
        </View>
        {!live ? (
          <Button
            title="START SHARING LOCATION"
            variant="success"
            loading={busy === 'start'}
            onPress={async () => {
              setBusy('start');
              await beginTracking(true);
              setBusy(null);
            }}
          />
        ) : (
          <Text style={styles.hint}>
            You can lock the phone — sharing continues until you end the trip.
          </Text>
        )}
      </Card>

      <SectionTitle>Actions</SectionTitle>
      {trip.has_issue ? (
        <Button
          title="ISSUE RESOLVED ✅"
          variant="primary"
          onPress={markResolved}
          loading={busy === 'resolve'}
          disabled={busy !== null}
        />
      ) : (
        <Button
          title="REPORT ISSUE 🚨"
          variant="warning"
          onPress={() => setIssueOpen(true)}
          disabled={busy !== null}
        />
      )}
      <Button
        testID="end-trip"
        title="END TRIP"
        variant="danger"
        onPress={confirmEnd}
        loading={busy === 'end'}
        disabled={busy !== null}
      />

      <Modal
        visible={issueOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIssueOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Report an issue</Text>
            <View style={styles.chips}>
              {ISSUE_OPTIONS.map(option => (
                <Pressable
                  key={option}
                  accessibilityRole="button"
                  accessibilityState={{selected: option === issueType}}
                  onPress={() => setIssueType(option)}
                  style={[
                    styles.chip,
                    option === issueType && styles.chipSelected,
                  ]}>
                  <Text
                    style={[
                      styles.chipText,
                      option === issueType && styles.chipTextSelected,
                    ]}>
                    {option}
                  </Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              style={styles.textArea}
              placeholder={
                issueType === 'Other'
                  ? 'Describe the problem'
                  : 'Details (optional)'
              }
              placeholderTextColor={colors.muted}
              value={issueText}
              onChangeText={setIssueText}
              multiline
              maxLength={400}
            />
            <Button
              title="SEND"
              variant="warning"
              onPress={submitIssue}
              loading={busy === 'issue'}
            />
            <Button
              title="CANCEL"
              variant="secondary"
              onPress={() => setIssueOpen(false)}
              disabled={busy === 'issue'}
            />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function Stat({label, value}: {label: string; value: string}) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {padding: spacing.lg, paddingBottom: spacing.xl * 2},
  bus: {fontSize: 26, fontWeight: '800', color: colors.text},
  route: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.primaryDark,
    marginTop: 2,
  },
  muted: {fontSize: 14, color: colors.muted, marginTop: spacing.xs},
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  dot: {width: 14, height: 14, borderRadius: 7, marginRight: spacing.sm},
  statusText: {fontSize: 17, fontWeight: '700', color: colors.text, flex: 1},
  grid: {flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.sm},
  stat: {width: '50%', paddingVertical: spacing.xs},
  statLabel: {
    fontSize: 12,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  statValue: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    marginTop: 2,
  },
  hint: {fontSize: 13, color: colors.muted},
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
    marginBottom: spacing.md,
  },
  chips: {flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.md},
  chip: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: colors.border,
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
  },
  chipSelected: {
    borderColor: colors.warning,
    backgroundColor: colors.warningBg,
  },
  chipText: {fontSize: 15, color: colors.text, fontWeight: '600'},
  chipTextSelected: {color: colors.warning},
  textArea: {
    minHeight: TOUCH * 2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 16,
    color: colors.text,
    textAlignVertical: 'top',
    marginBottom: spacing.sm,
  },
});
