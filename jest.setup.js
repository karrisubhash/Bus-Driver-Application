/* eslint-env jest */

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('@react-native-community/netinfo', () =>
  require('@react-native-community/netinfo/jest/netinfo-mock.js'),
);

jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);

jest.mock('react-native-geolocation-service', () => ({
  __esModule: true,
  default: {
    requestAuthorization: jest.fn(() => Promise.resolve('granted')),
    getCurrentPosition: jest.fn(),
    watchPosition: jest.fn(() => 1),
    clearWatch: jest.fn(),
    stopObserving: jest.fn(),
  },
}));

jest.mock('react-native-background-actions', () => {
  let running = false;
  return {
    __esModule: true,
    default: {
      start: jest.fn(async () => {
        running = true;
      }),
      stop: jest.fn(async () => {
        running = false;
      }),
      isRunning: jest.fn(() => running),
      updateNotification: jest.fn(async () => {}),
      on: jest.fn(),
    },
  };
});
