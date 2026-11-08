import AsyncStorage from '@react-native-async-storage/async-storage';

import {MAX_QUEUED_PINGS} from './config';
import type {PingPayload, Session, Trip} from './types';

const KEYS = {
  session: '@bt/session',
  activeTrip: '@bt/activeTrip',
  pingQueue: '@bt/pingQueue',
  lastChoice: '@bt/lastChoice',
} as const;

async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full / unavailable: the app keeps working from memory.
  }
}

// ---- Session ---------------------------------------------------------------

export const loadSession = () => readJson<Session>(KEYS.session);
export const saveSession = (session: Session) =>
  writeJson(KEYS.session, session);

export async function updateTokens(
  access: string,
  refresh?: string,
): Promise<void> {
  const session = await loadSession();
  if (session) {
    await saveSession({
      ...session,
      access,
      refresh: refresh ?? session.refresh,
    });
  }
}

// ---- Active trip -----------------------------------------------------------

export const loadActiveTrip = () => readJson<Trip>(KEYS.activeTrip);
export const saveActiveTrip = (trip: Trip) => writeJson(KEYS.activeTrip, trip);
export const clearActiveTrip = () =>
  AsyncStorage.removeItem(KEYS.activeTrip).catch(() => {});

// ---- Offline ping queue ----------------------------------------------------

interface StoredQueue {
  tripId: number;
  pings: PingPayload[];
}

/** Keep only the newest `max` fixes. */
export function capQueue(
  pings: PingPayload[],
  max: number = MAX_QUEUED_PINGS,
): PingPayload[] {
  return pings.length > max ? pings.slice(pings.length - max) : pings;
}

export async function loadPingQueue(tripId: number): Promise<PingPayload[]> {
  const stored = await readJson<StoredQueue>(KEYS.pingQueue);
  return stored && stored.tripId === tripId && Array.isArray(stored.pings)
    ? capQueue(stored.pings)
    : [];
}

export const savePingQueue = (tripId: number, pings: PingPayload[]) =>
  writeJson(KEYS.pingQueue, {
    tripId,
    pings: capQueue(pings),
  } satisfies StoredQueue);

export const clearPingQueue = () =>
  AsyncStorage.removeItem(KEYS.pingQueue).catch(() => {});

// ---- Remembered trip choice ------------------------------------------------

export interface LastChoice {
  busId: number | null;
  routeId: number | null;
}

export const loadLastChoice = () => readJson<LastChoice>(KEYS.lastChoice);
export const saveLastChoice = (choice: LastChoice) =>
  writeJson(KEYS.lastChoice, choice);

// ---- Everything ------------------------------------------------------------

export async function clearAll(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([
      KEYS.session,
      KEYS.activeTrip,
      KEYS.pingQueue,
    ]);
  } catch {
    // ignore
  }
}
