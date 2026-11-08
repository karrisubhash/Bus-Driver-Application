import React, {useMemo, useState} from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {colors, radius, spacing, TOUCH} from '../theme';

export interface SelectOption {
  id: number;
  label: string;
  hint?: string;
  disabled?: boolean;
}

/** Tappable field that opens a searchable list (works for 3 or 300 buses). */
export function SelectField({
  label,
  placeholder,
  options,
  value,
  onChange,
  testID,
}: {
  label: string;
  placeholder: string;
  options: SelectOption[];
  value: number | null;
  onChange: (id: number) => void;
  testID?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = options.find(o => o.id === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? options.filter(o =>
          `${o.label} ${o.hint ?? ''}`.toLowerCase().includes(q),
        )
      : options;
  }, [options, query]);

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${
          selected ? selected.label : placeholder
        }`}
        style={styles.field}
        onPress={() => setOpen(true)}>
        <Text
          style={[styles.fieldText, !selected && styles.placeholder]}
          numberOfLines={1}>
          {selected ? selected.label : placeholder}
        </Text>
        <Text style={styles.chevron}>▾</Text>
      </Pressable>

      <Modal visible={open} animationType="slide" onRequestClose={close}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.title}>{label}</Text>
            <Pressable
              onPress={close}
              accessibilityRole="button"
              style={styles.closeButton}>
              <Text style={styles.close}>Close</Text>
            </Pressable>
          </View>
          {options.length > 8 && (
            <TextInput
              style={styles.search}
              placeholder="Search…"
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
              autoCapitalize="none"
              placeholderTextColor={colors.muted}
            />
          )}
          <FlatList
            data={filtered}
            keyExtractor={item => String(item.id)}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <Text style={styles.empty}>Nothing found.</Text>
            }
            renderItem={({item}) => (
              <Pressable
                disabled={item.disabled}
                accessibilityRole="button"
                accessibilityState={{
                  disabled: item.disabled,
                  selected: item.id === value,
                }}
                onPress={() => {
                  onChange(item.id);
                  close();
                }}
                style={({pressed}) => [
                  styles.option,
                  item.id === value && styles.optionSelected,
                  pressed && styles.optionPressed,
                ]}>
                <Text
                  style={[
                    styles.optionText,
                    item.disabled && styles.optionDisabled,
                  ]}>
                  {item.label}
                </Text>
                {item.hint ? (
                  <Text
                    style={[
                      styles.hint,
                      item.disabled && styles.optionDisabled,
                    ]}>
                    {item.hint}
                  </Text>
                ) : null}
              </Pressable>
            )}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {marginBottom: spacing.md},
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  field: {
    minHeight: TOUCH,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  fieldText: {flex: 1, fontSize: 16, color: colors.text},
  placeholder: {color: colors.muted},
  chevron: {fontSize: 18, color: colors.muted, marginLeft: spacing.sm},
  modal: {flex: 1, backgroundColor: colors.background},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  title: {fontSize: 18, fontWeight: '700', color: colors.text},
  closeButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  close: {fontSize: 16, color: colors.primary, fontWeight: '600'},
  search: {
    margin: spacing.md,
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    fontSize: 16,
    color: colors.text,
  },
  option: {
    minHeight: TOUCH + 8,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  optionSelected: {backgroundColor: colors.infoBg},
  optionPressed: {opacity: 0.7},
  optionText: {fontSize: 16, color: colors.text, fontWeight: '600'},
  optionDisabled: {color: colors.disabled},
  hint: {fontSize: 13, color: colors.muted, marginTop: 2},
  empty: {textAlign: 'center', color: colors.muted, padding: spacing.xl},
});
