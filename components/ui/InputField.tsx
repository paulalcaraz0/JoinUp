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
import { Colors, Typography, BorderRadius, Spacing } from '../../constants/theme';
import { useThemeColors } from '../../hooks/useThemeColors';

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
  const { colors } = useThemeColors();

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
            {
              backgroundColor: isFocused ? colors.surfaceElevated : colors.surface,
              borderColor: error ? colors.danger : isFocused ? colors.accent : colors.divider,
              color: colors.text,
            },
          ]}
          placeholderTextColor={colors.slate}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          {...props}
        />
        {rightAccessory ? <View style={styles.accessoryWrap}>{rightAccessory}</View> : null}
      </View>
      {error ? <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.md,
  },
  label: {
    fontFamily: Typography.bodyBold,
    fontSize: 13,
    color: Colors.text,
    marginBottom: 7,
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
    paddingVertical: 13,
    paddingRight: 48,
    fontFamily: Typography.body,
    fontSize: 15,
    color: Colors.text,
    minHeight: 50,
  },
  inputWithAccessory: {
    paddingRight: 48,
  },
  inputFocused: {
    borderColor: Colors.accent,
    backgroundColor: Colors.white,
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
