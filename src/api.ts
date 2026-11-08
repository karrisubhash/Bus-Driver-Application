import axios, {AxiosError, InternalAxiosRequestConfig} from 'axios';

import {API_BASE_URL, REQUEST_TIMEOUT_MS} from './config';
import {updateTokens} from './storage';
import type {
  DriverOptions,
  DriverTrips,
  PingPayload,
  PingResult,
  Session,
  Trip,
} from './types';

declare module 'axios' {
  interface AxiosRequestConfig {
    /** Don't attach the bearer token / don't try to refresh (login, refresh, logout). */
    skipAuth?: boolean;
  }
  interface InternalAxiosRequestConfig {
    _retried?: boolean;
  }
}

const API_ROOT = `${API_BASE_URL}/api/v1/`;

export const http = axios.create({
  baseURL: API_ROOT,
  timeout: REQUEST_TIMEOUT_MS,
  headers: {'Content-Type': 'application/json', Accept: 'application/json'},
});

// ---- Token handling --------------------------------------------------------

let accessToken: string | null = null;
let refreshToken: string | null = null;
let refreshInFlight: Promise<string> | null = null;
let onSessionExpired: (() => void) | null = null;

export function setTokens(access: string | null, refresh: string | null): void {
  accessToken = access;
  refreshToken = refresh;
}

export function getRefreshToken(): string | null {
  return refreshToken;
}

/** Called when the refresh token is rejected; the app should sign the user out. */
export function setOnSessionExpired(handler: (() => void) | null): void {
  onSessionExpired = handler;
}

class SessionExpiredError extends Error {
  constructor() {
    super('Your session has expired. Please sign in again.');
    this.name = 'SessionExpiredError';
  }
}

async function refreshAccessToken(): Promise<string> {
  if (!refreshToken) {
    throw new SessionExpiredError();
  }
  try {
    const {data} = await axios.post<{access: string; refresh?: string}>(
      `${API_ROOT}token/refresh/`,
      {refresh: refreshToken},
      {timeout: REQUEST_TIMEOUT_MS, skipAuth: true},
    );
    accessToken = data.access;
    if (data.refresh) {
      refreshToken = data.refresh; // rotation: the old refresh token is now blacklisted
    }
    await updateTokens(data.access, data.refresh);
    return data.access;
  } catch (error) {
    const status = (error as AxiosError).response?.status;
    if (status === 401 || status === 400) {
      throw new SessionExpiredError();
    }
    throw error; // network problem: keep the session, caller can retry later
  }
}

http.interceptors.request.use(config => {
  if (accessToken && !config.skipAuth) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

http.interceptors.response.use(
  response => response,
  async (error: AxiosError) => {
    const config = error.config as InternalAxiosRequestConfig | undefined;
    if (
      !config ||
      config.skipAuth ||
      config._retried ||
      error.response?.status !== 401
    ) {
      throw error;
    }
    config._retried = true;
    try {
      refreshInFlight = refreshInFlight ?? refreshAccessToken();
      const token = await refreshInFlight;
      config.headers.Authorization = `Bearer ${token}`;
      return http(config);
    } catch (refreshError) {
      if (refreshError instanceof SessionExpiredError) {
        onSessionExpired?.();
        throw refreshError;
      }
      throw refreshError;
    } finally {
      refreshInFlight = null;
    }
  },
);

// ---- Error helpers ---------------------------------------------------------

export function errorStatus(error: unknown): number | undefined {
  return (error as AxiosError)?.response?.status;
}

export function isNetworkError(error: unknown): boolean {
  const err = error as AxiosError;
  return Boolean(err?.isAxiosError && !err.response);
}

export function isSessionExpired(error: unknown): boolean {
  return error instanceof SessionExpiredError;
}

/** Human-readable message from a server/network error. */
export function errorMessage(
  error: unknown,
  fallback = 'Something went wrong. Please try again.',
): string {
  if (error instanceof SessionExpiredError) {
    return error.message;
  }
  const err = error as AxiosError<any>;
  if (err?.isAxiosError) {
    if (!err.response) {
      return err.code === 'ECONNABORTED'
        ? 'The server took too long to respond. Check your connection and try again.'
        : 'No internet connection. Check your network and try again.';
    }
    const data = err.response.data;
    if (data && typeof data === 'object') {
      if (typeof data.detail === 'string') {
        return data.detail;
      }
      const first = Object.values(data)[0];
      if (Array.isArray(first) && typeof first[0] === 'string') {
        return first[0];
      }
      if (typeof first === 'string') {
        return first;
      }
    }
    if (err.response.status >= 500) {
      return 'The server is having trouble. Please try again in a minute.';
    }
  }
  return fallback;
}

// ---- Endpoints -------------------------------------------------------------

export async function login(
  username: string,
  password: string,
): Promise<Session> {
  const {data} = await http.post<Session>(
    'token/',
    {username, password},
    {skipAuth: true},
  );
  return data;
}

export async function logout(): Promise<void> {
  if (!refreshToken) {
    return;
  }
  try {
    await http.post(
      'token/logout/',
      {refresh: refreshToken},
      {skipAuth: true, timeout: 5000},
    );
  } catch {
    // best effort: the token simply expires
  }
}

export const getDriverTrips = async () =>
  (await http.get<DriverTrips>('driver/trips/')).data;

export const getDriverOptions = async () =>
  (await http.get<DriverOptions>('driver/options/')).data;

export async function startTrip(
  body: {trip_id: number} | {bus_id: number; route_id: number | null},
): Promise<Trip> {
  return (await http.post<Trip>('driver/trips/start/', body)).data;
}

export async function endTrip(tripId: number): Promise<Trip> {
  return (await http.post<{trip: Trip}>(`trips/${tripId}/end/`, {})).data.trip;
}

export async function reportIssue(
  tripId: number,
  issue: string,
): Promise<Trip> {
  return (
    await http.post<{trip: Trip}>(`trips/${tripId}/report-issue/`, {issue})
  ).data.trip;
}

export async function resolveIssue(tripId: number): Promise<Trip> {
  return (await http.post<{trip: Trip}>(`trips/${tripId}/resolve-issue/`, {}))
    .data.trip;
}

export async function sendPings(
  tripId: number,
  pings: PingPayload[],
): Promise<PingResult> {
  return (await http.post<PingResult>(`trips/${tripId}/pings/`, {pings})).data;
}
