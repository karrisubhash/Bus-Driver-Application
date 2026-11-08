/**
 * @format
 */

import 'react-native';
import React from 'react';
import {act, create, ReactTestRenderer} from 'react-test-renderer';
import {it, expect} from '@jest/globals';

import App from '../App';

it('shows the sign-in screen when there is no saved session', async () => {
  let tree: ReactTestRenderer | undefined;
  await act(async () => {
    tree = create(<App />);
  });
  // Let the async session restore settle.
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  const root = tree!.root;
  expect(root.findAllByProps({testID: 'login-button'}).length).toBeGreaterThan(
    0,
  );
  expect(root.findAllByProps({testID: 'username'}).length).toBeGreaterThan(0);
  act(() => tree!.unmount());
}, 30000);
