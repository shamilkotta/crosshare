import React, { useEffect } from 'react';
import { StyleSheet, View, TouchableOpacity } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
  interpolate,
  Extrapolation,
  Easing,
} from 'react-native-reanimated';
import { IconSymbol } from './ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';

const CIRCLE_COUNT = 3;

interface CircleProps {
  delay: number;
  color: string;
}

const AnimatedCircle = ({ delay, color }: CircleProps) => {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withRepeat(
        withTiming(1, {
          duration: 3000,
          easing: Easing.bezier(0.25, 0.1, 0.25, 1),
        }),
        -1,
        false
      )
    );
  }, [delay, progress]);

  const animatedStyle = useAnimatedStyle(() => {
    const scale = interpolate(
      progress.value,
      [0, 1],
      [0.8, 2.8],
      Extrapolation.CLAMP
    );
    // Circles are visible for most of the cycle (from 0 to 0.8) then fade out
    const opacity = interpolate(
      progress.value,
      [0, 0.2, 0.8, 1],
      [0, 0.3, 0.3, 0],
      Extrapolation.CLAMP
    );

    return {
      transform: [{ scale }],
      opacity,
      borderColor: color,
    };
  });

  return <Animated.View style={[styles.circle, animatedStyle]} />;
};

export function PlusAnimatedCircles({ onPress }: { onPress?: () => void }) {
  const colorScheme = useColorScheme();
  const themeColors = Colors[colorScheme ?? 'light'];

  return (
    <View style={styles.container}>
      {[...Array(CIRCLE_COUNT)].map((_, i) => (
        <AnimatedCircle
          key={i}
          delay={i * 1000}
          color={themeColors.circleColor}
        />
      ))}
      <TouchableOpacity
        style={[
          styles.plusContainer,
          {
            backgroundColor: themeColors.surface,
            borderColor: themeColors.border,
          },
        ]}
        onPress={onPress}
        activeOpacity={0.7}
      >
        <IconSymbol name="plus" size={32} color={themeColors.text} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 200,
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  circle: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 1,
  },
  plusContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    borderWidth: 1,
  },
});
