import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';

import {colors, radius, spacing, TOUCH} from '../theme';

type Variant = 'primary' | 'success' | 'danger' | 'warning' | 'secondary';

const VARIANT_BG: Record<Variant, string> = {
  primary: colors.primary,
  success: colors.success,
  danger: colors.danger,
  warning: colors.warning,
  secondary: colors.surface,
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  style,
  testID,
}: {
  title: string;
  onPress: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  testID?: string;
}) {
  const inactive = disabled || loading;
  const secondary = variant === 'secondary';
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{disabled: inactive, busy: loading}}
      onPress={onPress}
      disabled={inactive}
      style={({pressed}) => [
        styles.button,
        {
          backgroundColor:
            inactive && !secondary ? colors.disabled : VARIANT_BG[variant],
        },
        secondary && styles.secondary,
        pressed && !inactive && styles.pressed,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={secondary ? colors.primary : '#fff'} />
      ) : (
        <Text style={[styles.buttonText, secondary && styles.secondaryText]}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Banner({
  text,
  tone = 'info',
}: {
  text: string;
  tone?: 'info' | 'danger' | 'warning' | 'success';
}) {
  const bg = {
    info: colors.infoBg,
    danger: colors.dangerBg,
    warning: colors.warningBg,
    success: colors.successBg,
  }[tone];
  const fg = {
    info: colors.primaryDark,
    danger: colors.danger,
    warning: colors.warning,
    success: colors.success,
  }[tone];
  return (
    <View
      style={[styles.banner, {backgroundColor: bg}]}
      accessibilityRole="alert">
      <Text style={[styles.bannerText, {color: fg}]}>{text}</Text>
    </View>
  );
}

export function SectionTitle({children}: {children: React.ReactNode}) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

const styles = StyleSheet.create({
  button: {
    minHeight: TOUCH,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing.xs,
  },
  secondary: {borderWidth: 1.5, borderColor: colors.primary},
  pressed: {opacity: 0.85},
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  secondaryText: {color: colors.primary},
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  banner: {
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  bannerText: {fontSize: 14, fontWeight: '600', lineHeight: 20},
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
});
