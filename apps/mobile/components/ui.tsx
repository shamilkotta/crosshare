import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import React, { ComponentProps, useEffect, useState } from 'react';
import {
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextProps,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Platform as DevicePlatform } from '@crosshare/core';

import { Colors, Fonts, Palette, Radius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export type IconName = ComponentProps<typeof Feather>['name'];

export function useColors(): Palette {
  return Colors[useColorScheme()];
}

export const tap = () => Haptics.selectionAsync().catch(() => {});

// MARK: Text

const variants = {
  title: { fontFamily: Fonts.sans.semiBold, fontSize: 22, letterSpacing: -0.4 },
  heading: { fontFamily: Fonts.sans.semiBold, fontSize: 16, letterSpacing: -0.2 },
  body: { fontFamily: Fonts.sans.regular, fontSize: 15 },
  medium: { fontFamily: Fonts.sans.medium, fontSize: 15 },
  small: { fontFamily: Fonts.sans.regular, fontSize: 13 },
  label: {
    fontFamily: Fonts.sans.medium,
    fontSize: 12,
    letterSpacing: 0.2,
  },
  code: { fontFamily: Fonts.mono.regular, fontSize: 40, letterSpacing: 6 },
} as const;

type Tone = 'primary' | 'secondary' | 'tertiary' | 'inverse';

export function Txt({
  variant = 'body',
  tone = 'primary',
  style,
  ...props
}: TextProps & { variant?: keyof typeof variants; tone?: Tone }) {
  const c = useColors();
  const color = {
    primary: c.text,
    secondary: c.secondary,
    tertiary: c.tertiary,
    inverse: c.onInverse,
  }[tone];
  return <Text {...props} style={[variants[variant], { color }, style]} />;
}

export function Icon({
  name,
  size = 18,
  tone = 'primary',
}: {
  name: IconName;
  size?: number;
  tone?: Tone;
}) {
  const c = useColors();
  const color = {
    primary: c.text,
    secondary: c.secondary,
    tertiary: c.tertiary,
    inverse: c.onInverse,
  }[tone];
  return <Feather name={name} size={size} color={color} />;
}

// MARK: Buttons

export function Button({
  title,
  onPress,
  variant = 'secondary',
  icon,
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  icon?: IconName;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  const primary = variant === 'primary';
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        primary
          ? { backgroundColor: c.inverse }
          : variant === 'secondary'
            ? {
                backgroundColor: c.background,
                borderColor: c.borderStrong,
                borderWidth: StyleSheet.hairlineWidth * 2,
              }
            : null,
        { opacity: disabled ? 0.4 : pressed ? 0.7 : 1 },
        style,
      ]}
    >
      {icon && <Icon name={icon} size={16} tone={primary ? 'inverse' : 'primary'} />}
      <Txt
        variant="medium"
        tone={primary ? 'inverse' : 'primary'}
        numberOfLines={1}
        style={{ flexShrink: 1 }}
      >
        {title}
      </Txt>
    </Pressable>
  );
}

export function IconButton({
  icon,
  onPress,
  label,
  tone = 'secondary',
}: {
  icon: IconName;
  onPress: () => void;
  label: string;
  tone?: Tone;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      hitSlop={10}
      onPress={onPress}
      style={({ pressed }) => [styles.iconButton, { opacity: pressed ? 0.5 : 1 }]}
    >
      <Icon name={icon} size={18} tone={tone} />
    </Pressable>
  );
}

// MARK: Layout

export function Section({
  title,
  right,
  children,
  style,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.section, style]}>
      <View style={styles.sectionHeader}>
        <Txt variant="label" tone="secondary">
          {title}
        </Txt>
        {right}
      </View>
      {children}
    </View>
  );
}

/** Bordered group of rows, separated by hairlines. */
export function Group({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={[styles.group, { borderColor: c.border }, style]}>
      {items.map((child, i) => (
        <View
          key={i}
          style={
            i > 0 && {
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: c.border,
            }
          }
        >
          {child}
        </View>
      ))}
    </View>
  );
}

export function Row({
  onPress,
  onLongPress,
  children,
  style,
}: {
  onPress?: () => void;
  onLongPress?: () => void;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={!onPress && !onLongPress}
      style={({ pressed }) => [
        styles.row,
        pressed && { backgroundColor: c.surfaceHover },
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}

export function DeviceIcon({
  platform,
  size = 36,
  dim,
}: {
  platform: DevicePlatform;
  size?: number;
  dim?: boolean;
}) {
  const c = useColors();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: Radius.md,
        borderWidth: StyleSheet.hairlineWidth * 2,
        borderColor: c.border,
        backgroundColor: c.surface,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: dim ? 0.5 : 1,
      }}
    >
      <Icon
        name={platform === 'macos' ? 'monitor' : 'smartphone'}
        size={size * 0.46}
      />
    </View>
  );
}

export function Progress({ value }: { value: number }) {
  const c = useColors();
  return (
    <View style={[styles.track, { backgroundColor: c.border }]}>
      <View
        style={{
          width: `${Math.max(0, Math.min(1, value)) * 100}%`,
          height: '100%',
          backgroundColor: c.text,
          borderRadius: 2,
        }}
      />
    </View>
  );
}

export function Tag({ label }: { label: string }) {
  const c = useColors();
  return (
    <View style={[styles.tag, { borderColor: c.borderStrong }]}>
      <Txt variant="label" tone="secondary" style={{ fontSize: 11 }}>
        {label}
      </Txt>
    </View>
  );
}

// MARK: Sheet

/** Bottom sheet. Tapping the backdrop closes it unless `dismissable` is false. */
export function Sheet({
  visible,
  onClose,
  dismissable = true,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  dismissable?: boolean;
  children: React.ReactNode;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardHeight();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={dismissable ? onClose : undefined}
    >
      {/* Modals don't resize with the keyboard on Android, so lift the sheet by hand. */}
      <View style={{ flex: 1, paddingBottom: keyboard }}>
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: c.overlay }]}
          onPress={dismissable ? onClose : undefined}
        />
        <View style={{ flex: 1 }} pointerEvents="box-none" />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: c.background,
              borderColor: c.border,
              paddingBottom: (keyboard ? 0 : Math.max(insets.bottom, 16)) + 16,
            },
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: c.borderStrong }]} />
          {children}
        </View>
      </View>
    </Modal>
  );
}

function useKeyboardHeight() {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const subs = [
      Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', (e) =>
        setHeight(e.endCoordinates.height)
      ),
      Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () =>
        setHeight(0)
      ),
    ];
    return () => subs.forEach((s) => s.remove());
  }, []);
  return height;
}

export const styles = StyleSheet.create({
  button: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: Radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  iconButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: { gap: 8 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    minHeight: 20,
  },
  group: {
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 56,
  },
  track: { height: 3, borderRadius: 2, overflow: 'hidden' },
  tag: {
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 1,
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderBottomWidth: 0,
    paddingHorizontal: 20,
    paddingTop: 8,
    gap: 16,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    marginBottom: 4,
  },
});
