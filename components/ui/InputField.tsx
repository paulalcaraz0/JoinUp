import React, { useState } from 'react';
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  ViewStyle,
  TextInputProps,
  TouchableOpacity,
} from 'react-native';
import { Colors, Typography, BorderRadius, Spacing, Shadows } from '../../constants/theme';

interface InputFieldProps extends TextInputProps {
  label: string;
  error?: string;
  containerStyle?: ViewStyle;
  rightAccessory?: React.ReactNode;
}

export function InputField({
  label,
  error,
  containerStyle,
  rightAccessory,
  ...props
}: InputFieldProps) {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View style={[styles.container, containerStyle]}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputRow}>
        <TextInput
          style={[
            styles.input,
            rightAccessory ? styles.inputWithAccessory : null,
            isFocused && styles.inputFocused,
            error ? styles.inputError : null,
          ]}
          placeholderTextColor={Colors.slate}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          {...props}
        />
        {rightAccessory ? <View style={styles.accessoryWrap}>{rightAccessory}</View> : null}
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.md,
  },
  label: {
    fontFamily: Typography.bodyMed,
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  inputRow: {
    position: 'relative',
  },
  input: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.divider,
    borderRadius: BorderRadius.input,
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    paddingRight: 48,
    fontFamily: Typography.body,
    fontSize: 16,
    color: Colors.text,
    minHeight: 48,
    ...Shadows.soft,
  },
  inputWithAccessory: {
    paddingRight: 48,
  },
  inputFocused: {
    borderColor: Colors.accent,
    backgroundColor: Colors.surfaceElevated,
  },
  inputError: {
    borderColor: Colors.danger,
  },
  accessoryWrap: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontFamily: Typography.body,
    fontSize: 12,
    color: Colors.danger,
    marginTop: Spacing.xs,
  },
});
