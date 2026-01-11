import { useTheme } from '@/context/theme-context';

export function useColorScheme() {
  const { colorScheme } = useTheme();
  return colorScheme;
}
