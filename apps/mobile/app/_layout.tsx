import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider as NavigationThemeProvider,
} from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { ThemeProvider } from '@/context/theme-context';
import { CrosshareProvider } from '@/context/crosshare-context';
import { RequestSheet } from '@/components/request-sheet';
import { Colors } from '@/constants/theme';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded] = useFonts({
    'Geist-Regular': require('../assets/fonts/Geist-Regular.ttf'),
    'Geist-Medium': require('../assets/fonts/Geist-Medium.ttf'),
    'Geist-SemiBold': require('../assets/fonts/Geist-SemiBold.ttf'),
    'Geist-Bold': require('../assets/fonts/Geist-Bold.ttf'),
    'GeistMono-Regular': require('../assets/fonts/GeistMono-Regular.ttf'),
  });

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <ThemeProvider>
      <CrosshareProvider>
        <LayoutContent />
        <RequestSheet />
      </CrosshareProvider>
    </ThemeProvider>
  );
}

function LayoutContent() {
  const colorScheme = useColorScheme();

  return (
    <NavigationThemeProvider
      value={{
        ...(colorScheme === 'dark' ? DarkTheme : DefaultTheme),
        colors: {
          ...(colorScheme === 'dark' ? DarkTheme : DefaultTheme).colors,
          background: Colors[colorScheme].background,
        },
      }}
    >
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="activity" />
      </Stack>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
    </NavigationThemeProvider>
  );
}
