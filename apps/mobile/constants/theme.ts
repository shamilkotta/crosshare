/**
 * Monochrome palette shared with the macOS app (apps/mac/Sources/Crosshare/Theme.swift).
 * Hierarchy comes from weight and grey levels, never from hue.
 */
export const Colors = {
  light: {
    background: '#FFFFFF',
    surface: '#FAFAFA',
    surfaceHover: '#F2F2F2',
    text: '#0A0A0A',
    secondary: '#666666',
    tertiary: '#A3A3A3',
    border: '#EBEBEB',
    borderStrong: '#D4D4D4',
    /** Primary button fill and the text on it. */
    inverse: '#0A0A0A',
    onInverse: '#FFFFFF',
    overlay: 'rgba(0,0,0,0.32)',
  },
  dark: {
    background: '#0A0A0A',
    surface: '#111111',
    surfaceHover: '#1A1A1A',
    text: '#EDEDED',
    secondary: '#A1A1A1',
    tertiary: '#5C5C5C',
    border: '#1F1F1F',
    borderStrong: '#2E2E2E',
    inverse: '#EDEDED',
    onInverse: '#0A0A0A',
    overlay: 'rgba(0,0,0,0.6)',
  },
};

export type Palette = (typeof Colors)['light'];

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

export const Radius = { sm: 6, md: 10, lg: 14 };
