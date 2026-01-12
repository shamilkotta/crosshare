/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

const tintColorLight = '#0a7ea4';
const tintColorDark = '#fff';

export const Colors = {
  light: {
    text: '#11181C',
    background: '#fff',
    tint: tintColorLight,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,
    mutedText: '#999',
    subtleText: '#CCC',
    border: '#b7b7b7ff',
    divider: '#e3e3e3ff',
    surface: '#F0F0F0',
    circleColor: 'rgba(0, 0, 0, 0.15)',
    dark: '#000000',
    light: '#FFFFFF',
  },
  dark: {
    text: '#ECEDEE',
    background: '#000000',
    tint: tintColorDark,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
    mutedText: '#666',
    subtleText: '#444',
    border: '#4e4e4eff',
    divider: '#1e1e1eff',
    surface: '#1A1A1A',
    circleColor: 'rgba(255, 255, 255, 0.4)',
    dark: '#FFF',
    light: '#000000',
  },
};

export const Fonts = {
  sans: {
    regular: 'Geist-Regular',
    medium: 'Geist-Medium',
    semiBold: 'Geist-SemiBold',
    bold: 'Geist-Bold',
  },
  mono: {
    regular: 'GeistMono-Regular',
  },
};
