/**
 * Background location tracking.
 *
 * A foreground service (react-native-background-actions, type "location")
 * keeps the JS runtime alive while the screen is off. GPS fixes from
 * watchPosition are queued and uploaded in batches every PING_INTERVAL_MS.
 * When offline, the queue is persisted and retried with exponential backoff;
 * NetInfo wakes the loop as soon as the connection returns.
 */
import NetInfo from '@react-native-community/netinfo';
import BackgroundService from 'react-native-background-actions';
import Geolocation, {
  GeoError,
  GeoPosition,
} from 'react-native-geolocation-service';

import {
  errorMessage,
  errorStatus,
  isNetworkError,
  isSessionExpired,
  sendPings,
} from './api';
import {
  HEARTBEAT_MS,
  MAX_ACCURACY_M,
  MAX_RETRY_DELAY_MS,
  PING_BATCH_SIZE,
  PING_INTERVAL_MS,
} from './config';
import {
  capQueue,
  clearPingQueue,
  loadPingQueue,
  savePingQueue,
} from './storage';
import type {PingPayload} from './types';

export interface TrackingStatus {
  running: boolean;
  tripId: number | null;
  lastSentAt: number | null;
  lastFixAt: number | null;
  accuracy: number | null;
  queued: number;
  gpsError: string | null;
  networkError: string | null;
  /** Set when the server refused further pings (trip ended/cancelled/reassigned). */
  stoppedReason: string | null;
}

const INITIAL_STATUS: TrackingStatus = {
  running: false,
  tripId: null,
  lastSentAt: null,
  lastFixAt: null,
  accuracy: null,
  queued: 0,
  gpsError: null,
  networkError: null,
  stoppedReason: null,
};

let status: TrackingStatus = {...INITIAL_STATUS};
const listeners = new Set<(s: TrackingStatus) => void>();

function publish(patch: Partial<TrackingStatus>): void {
  status = {...status, ...patch};
  listeners.forEach(listener => listener(status));
}

export function getTrackingStatus(): TrackingStatus {
  return status;
}

export function subscribeTracking(
  listener: (s: TrackingStatus) => void,
): () => void {
  listeners.add(listener);
  listener(status);
  return () => {
    listeners.delete(listener);
  };
}

export function resetTrackingStatus(): void {
  publish({...INITIAL_STATUS});
}

// ---------------------------------------------------------------------------

export function toPing(position: GeoPosition): PingPayload | null {
  const c = position.coords;
  if (!Number.isFinite(c.latitude) || !Number.isFinite(c.longitude)) {
    return null;
  }
  const nonNegative = (value: number | null | undefined) =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0
      ? value
      : null;
  return {
    lat: c.latitude,
    lon: c.longitude,
    speed: nonNegative(c.speed),
    heading: nonNegative(c.heading),
    accuracy: nonNegative(c.accuracy),
    recorded_at: position.timestamp || Date.now(),
  };
}

function gpsErrorText(error: GeoError): string {
  switch (error.code) {
    case 1:
      return 'Location permission was removed. Re-enable it in Settings.';
    case 2:
      return 'No GPS signal. Make sure Location is turned on.';
    case 3:
      return 'Waiting for GPS…';
    case 4:
      return 'Google Play services is unavailable on this phone.';
    case 5:
      return 'Turn on Location (GPS) from quick settings.';
    default:
      return error.message || 'GPS error';
  }
}

function timeLabel(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

type FlushResult = 'sent' | 'idle' | 'retry' | 'fatal';

class TrackingRun {
  private queue: PingPayload[] = [];
  private lastFix: PingPayload | null = null;
  private lastEnqueuedAt = 0;
  private wakeUp: (() => void) | null = null;
  private cancelled = false;

  constructor(readonly tripId: number) {}

  private get isCurrent(): boolean {
    return currentRun === this && !this.cancelled;
  }

  private update(patch: Partial<TrackingStatus>): void {
    if (currentRun === this) {
      publish(patch);
    }
  }

  cancel(): void {
    this.cancelled = true;
    this.wake();
  }

  wake(): void {
    this.wakeUp?.();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => {
      const done = () => {
        clearTimeout(timer);
        this.wakeUp = null;
        resolve();
      };
      const timer = setTimeout(done, ms);
      this.wakeUp = done;
    });
  }

  private enqueue(ping: PingPayload): void {
    this.queue = capQueue([...this.queue, ping]);
    this.lastEnqueuedAt = Date.now();
    this.update({queued: this.queue.length});
  }

  private onFix = (position: GeoPosition): void => {
    const ping = toPing(position);
    if (!ping || this.cancelled) {
      return;
    }
    this.update({
      lastFixAt: Date.now(),
      accuracy: ping.accuracy,
      gpsError: null,
    });
    if (ping.accuracy !== null && ping.accuracy > MAX_ACCURACY_M) {
      return; // too inaccurate to be useful
    }
    this.lastFix = ping;
    this.enqueue(ping);
  };

  private onGpsError = (error: GeoError): void => {
    this.update({gpsError: gpsErrorText(error)});
  };

  private inFlight: Promise<FlushResult> | null = null;

  /** Upload one batch (concurrent callers share the same in-flight upload). */
  flush(): Promise<FlushResult> {
    if (!this.inFlight) {
      this.inFlight = this.flushOnce().finally(() => {
        this.inFlight = null;
      });
    }
    return this.inFlight;
  }

  private removeSent(batch: PingPayload[]): void {
    const sent = new Set(batch);
    this.queue = this.queue.filter(p => !sent.has(p));
  }

  private async flushOnce(): Promise<FlushResult> {
    if (!this.queue.length) {
      // Stationary bus: re-send the last fix now and then so it stays "live".
      if (this.lastFix && Date.now() - this.lastEnqueuedAt >= HEARTBEAT_MS) {
        this.enqueue({...this.lastFix});
      } else {
        return 'idle';
      }
    }
    const batch = this.queue.slice(0, PING_BATCH_SIZE);
    try {
      await sendPings(this.tripId, batch);
      this.removeSent(batch);
      this.update({
        lastSentAt: Date.now(),
        queued: this.queue.length,
        networkError: null,
      });
      return 'sent';
    } catch (error) {
      const code = errorStatus(error);
      if (
        isSessionExpired(error) ||
        code === 403 ||
        code === 404 ||
        code === 409
      ) {
        this.update({
          stoppedReason: errorMessage(error, 'This trip is no longer active.'),
        });
        return 'fatal';
      }
      if (code === 400) {
        // Malformed batch (should not happen): drop it rather than block the queue forever.
        this.removeSent(batch);
        this.update({queued: this.queue.length});
        return 'retry';
      }
      this.update({
        networkError: isNetworkError(error)
          ? 'Offline — locations are saved and will upload when the connection is back.'
          : errorMessage(error),
      });
      return 'retry';
    }
  }

  /** Upload everything queued (used right before ending a trip). */
  async drain(maxBatches = 5): Promise<void> {
    for (let i = 0; i < maxBatches && this.queue.length; i++) {
      if ((await this.flush()) !== 'sent') {
        return;
      }
    }
  }

  private async notify(): Promise<void> {
    const parts = [
      this.lastFix
        ? `Last sent ${status.lastSentAt ? timeLabel(status.lastSentAt) : '—'}`
        : 'Waiting for GPS…',
    ];
    if (this.queue.length) {
      parts.push(`${this.queue.length} waiting to upload`);
    }
    try {
      await BackgroundService.updateNotification({taskDesc: parts.join(' · ')});
    } catch {
      // service already stopped
    }
  }

  async execute(): Promise<void> {
    this.queue = await loadPingQueue(this.tripId);
    this.update({
      running: true,
      tripId: this.tripId,
      queued: this.queue.length,
      stoppedReason: null,
    });

    const watchId = Geolocation.watchPosition(this.onFix, this.onGpsError, {
      accuracy: {android: 'high', ios: 'bestForNavigation'},
      enableHighAccuracy: true,
      distanceFilter: 0,
      interval: PING_INTERVAL_MS,
      fastestInterval: Math.round(PING_INTERVAL_MS / 2),
      showLocationDialog: true,
      forceRequestLocation: true,
      showsBackgroundLocationIndicator: true,
    });
    const unsubscribeNet = NetInfo.addEventListener(state => {
      if (state.isConnected && this.queue.length) {
        this.wake();
      }
    });

    let delay = PING_INTERVAL_MS;
    let lastPersist = 0;
    let lastNotify = 0;
    let fatal = false;
    try {
      while (this.isCurrent && BackgroundService.isRunning()) {
        const result = await this.flush();
        if (result === 'fatal') {
          fatal = true;
          break;
        }
        delay =
          result === 'retry'
            ? Math.min(delay * 2, MAX_RETRY_DELAY_MS)
            : PING_INTERVAL_MS;
        const now = Date.now();
        if (result === 'retry' || now - lastPersist > 15_000) {
          await savePingQueue(this.tripId, this.queue);
          lastPersist = now;
        }
        if (now - lastNotify > 15_000) {
          await this.notify();
          lastNotify = now;
        }
        if (!this.isCurrent) {
          break;
        }
        await this.sleep(delay);
      }
    } finally {
      Geolocation.clearWatch(watchId);
      unsubscribeNet();
      if (fatal) {
        this.queue = [];
        await clearPingQueue();
      } else if (this.queue.length) {
        await savePingQueue(this.tripId, this.queue);
      }
      this.update({running: false, queued: this.queue.length});
      if (currentRun === this) {
        currentRun = null;
      }
    }
  }
}

let currentRun: TrackingRun | null = null;

async function trackingTask(params?: {tripId: number}): Promise<void> {
  if (!params?.tripId) {
    return;
  }
  currentRun?.cancel();
  const run = new TrackingRun(params.tripId);
  currentRun = run;
  await run.execute(); // when this resolves the foreground service stops itself
}

export function isTrackingRunning(): boolean {
  return BackgroundService.isRunning();
}

export async function startTracking(tripId: number): Promise<void> {
  if (BackgroundService.isRunning()) {
    if (currentRun?.tripId === tripId) {
      return;
    }
    await stopTracking();
  }
  publish({...INITIAL_STATUS, tripId});
  await BackgroundService.start(trackingTask, {
    taskName: 'BusTracking',
    taskTitle: 'Trip in progress — sharing bus location',
    taskDesc: 'Starting GPS…',
    taskIcon: {name: 'ic_launcher', type: 'mipmap'},
    color: '#1d4ed8',
    parameters: {tripId},
  });
}

export async function stopTracking(): Promise<void> {
  const run = currentRun;
  currentRun = null;
  run?.cancel();
  if (BackgroundService.isRunning()) {
    await BackgroundService.stop();
  }
  publish({running: false});
}

/** Best-effort upload of queued fixes for ``tripId`` (e.g. before ending the trip). */
export async function flushNow(tripId: number): Promise<void> {
  if (currentRun?.tripId === tripId) {
    await currentRun.drain();
  }
}

export async function discardQueue(): Promise<void> {
  await clearPingQueue();
  publish({queued: 0});
}
