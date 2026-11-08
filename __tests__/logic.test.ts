import {AxiosError, AxiosHeaders} from 'axios';
import {describe, expect, it} from '@jest/globals';

import {errorMessage, isNetworkError} from '../src/api';
import {relativeTime} from '../src/screens/TripScreen';
import {capQueue} from '../src/storage';
import {toPing} from '../src/tracking';
import type {PingPayload} from '../src/types';

function axiosError(
  status?: number,
  data?: unknown,
  code?: string,
): AxiosError {
  const config = {headers: new AxiosHeaders()};
  const response = status
    ? {status, statusText: '', headers: {}, config, data}
    : undefined;
  return new AxiosError('fail', code, config, undefined, response as any);
}

describe('errorMessage', () => {
  it('uses the server detail field', () => {
    expect(
      errorMessage(axiosError(409, {detail: 'Bus 7 is already on trip #3.'})),
    ).toBe('Bus 7 is already on trip #3.');
  });
  it('uses the first field error', () => {
    expect(
      errorMessage(
        axiosError(400, {bus_id: ['Provide either trip_id or bus_id.']}),
      ),
    ).toBe('Provide either trip_id or bus_id.');
  });
  it('explains network failures', () => {
    const err = axiosError(undefined, undefined, 'ERR_NETWORK');
    expect(isNetworkError(err)).toBe(true);
    expect(errorMessage(err)).toMatch(/No internet/);
  });
  it('explains server errors', () => {
    expect(errorMessage(axiosError(502, '<html>'))).toMatch(
      /server is having trouble/,
    );
  });
});

describe('capQueue', () => {
  it('keeps the newest fixes', () => {
    const pings: PingPayload[] = Array.from({length: 5}, (_, i) => ({
      lat: i,
      lon: i,
      speed: null,
      heading: null,
      accuracy: null,
      recorded_at: i,
    }));
    expect(capQueue(pings, 3).map(p => p.recorded_at)).toEqual([2, 3, 4]);
    expect(capQueue(pings, 10)).toHaveLength(5);
  });
});

describe('toPing', () => {
  it('sanitises unknown speed/heading', () => {
    const ping = toPing({
      coords: {
        latitude: 17.9,
        longitude: 83.4,
        accuracy: 8,
        altitude: null,
        heading: -1,
        speed: -1,
      },
      timestamp: 1700000000000,
    });
    expect(ping).toEqual({
      lat: 17.9,
      lon: 83.4,
      speed: null,
      heading: null,
      accuracy: 8,
      recorded_at: 1700000000000,
    });
  });
  it('rejects invalid coordinates', () => {
    expect(
      toPing({
        coords: {
          latitude: NaN,
          longitude: 83.4,
          accuracy: 8,
          altitude: null,
          heading: null,
          speed: null,
        },
        timestamp: 1,
      }),
    ).toBeNull();
  });
});

describe('relativeTime', () => {
  it('formats ages', () => {
    expect(relativeTime(null, 1000)).toBe('not yet');
    expect(relativeTime(1000, 6000)).toBe('5s ago');
    expect(relativeTime(0 + 1, 1 + 5 * 60_000)).toBe('5 min ago');
  });
});
