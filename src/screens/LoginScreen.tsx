import React, {useRef, useState} from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {errorMessage, login} from '../api';
import {Banner, Button} from '../components/ui';
import {APP_NAME} from '../config';
import {colors, radius, spacing, TOUCH} from '../theme';
import type {Session} from '../types';

export default function LoginScreen({
  onLoggedIn,
  notice,
}: {
  onLoggedIn: (session: Session) => void;
  notice?: string | null;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<TextInput>(null);

  const submit = async () => {
    const user = username.trim();
    if (!user || !password) {
      setError('Enter your username and password.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const session = await login(user, password);
      if (session.user.role !== 'driver') {
        setError(
          'This app is for bus drivers. Students and admins: please use the website.',
        );
        return;
      }
      setPassword('');
      onLoggedIn(session);
    } catch (e) {
      setError(
        errorMessage(e, 'Sign in failed. Check your username and password.'),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled">
        <View style={styles.brand}>
          <Text style={styles.logo}>🚌</Text>
          <Text style={styles.title}>{APP_NAME}</Text>
          <Text style={styles.subtitle}>
            Sign in with the account your transport office gave you.
          </Text>
        </View>

        {notice ? <Banner text={notice} tone="warning" /> : null}
        {error ? <Banner text={error} tone="danger" /> : null}

        <Text style={styles.label}>Username</Text>
        <TextInput
          testID="username"
          style={styles.input}
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
          textContentType="username"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          editable={!loading}
          placeholder="e.g. driver.ramesh"
          placeholderTextColor={colors.muted}
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          testID="password"
          ref={passwordRef}
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={submit}
          editable={!loading}
          placeholder="Password"
          placeholderTextColor={colors.muted}
        />

        <Button
          testID="login-button"
          title="SIGN IN"
          onPress={submit}
          loading={loading}
          style={styles.submit}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {flex: 1},
  container: {flexGrow: 1, justifyContent: 'center', padding: spacing.xl},
  brand: {alignItems: 'center', marginBottom: spacing.xl},
  logo: {fontSize: 56},
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
    marginTop: spacing.sm,
  },
  subtitle: {
    fontSize: 15,
    color: colors.muted,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
    marginTop: spacing.md,
  },
  input: {
    minHeight: TOUCH,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: 17,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  submit: {marginTop: spacing.xl},
});
