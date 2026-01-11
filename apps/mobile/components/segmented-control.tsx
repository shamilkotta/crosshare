import React, { useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Colors, Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

type SegmentedControlProps = {
  options: string[];
  selectedOption: string;
  onSelect: (option: string) => void;
};

export const SegmentedControl = ({
  options,
  selectedOption,
  onSelect,
}: SegmentedControlProps) => {
  const colorScheme = useColorScheme() ?? 'light';
  const themeColors = Colors[colorScheme];
  const { width: windowWidth } = useWindowDimensions();

  const containerWidth = windowWidth - 120;
  const segmentWidth = containerWidth / options.length;
  const selectedIndex = options.indexOf(selectedOption);

  const translateX = useSharedValue(selectedIndex * segmentWidth);

  useEffect(() => {
    translateX.value = withSpring(selectedIndex * segmentWidth, {
      damping: 25,
      stiffness: 300,
      mass: 0.5,
    });
  }, [selectedIndex, segmentWidth, translateX]);

  const animatedBackdropStyle = useAnimatedStyle(() => ({
    width: segmentWidth,
    transform: [{ translateX: translateX.value + 5 }],
  }));

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: themeColors.surface,
          borderColor: themeColors.border,
        },
      ]}
    >
      <Animated.View
        style={[
          styles.backdrop,
          { backgroundColor: themeColors.dark },
          animatedBackdropStyle,
        ]}
      />
      {options.map((option, index) => {
        const isSelected = selectedOption === option;
        return (
          <TouchableOpacity
            key={option}
            style={[styles.segment, { width: segmentWidth }]}
            onPress={() => onSelect(option)}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.label,
                {
                  color: isSelected ? themeColors.light : themeColors.mutedText,
                  fontFamily: isSelected ? Fonts.sans.bold : Fonts.sans.medium,
                },
              ]}
            >
              {option.toUpperCase()}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    // height: 54,
    borderRadius: 27,
    paddingHorizontal: 5,
    paddingVertical: 3,
    borderWidth: 1,
    position: 'relative',
    // gap: 3,
  },
  backdrop: {
    position: 'absolute',
    top: 3,
    height: '100%',
    borderRadius: 23,
    // Shadow for the white indicator
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  segment: {
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
    paddingVertical: 8,
  },
  label: {
    fontSize: 11,
  },
});
