import React, { useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Image,
  DimensionValue,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withDelay,
  interpolate,
  Extrapolation,
  Easing,
} from 'react-native-reanimated';

const CIRCLE_COUNT = 3;

const RadarCircle = ({ delay, color }: { delay: number; color: string }) => {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withRepeat(
        withTiming(1, {
          duration: 3000,
          easing: Easing.out(Easing.ease),
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
      [0.5, 4],
      Extrapolation.CLAMP
    );
    const opacity = interpolate(
      progress.value,
      [0, 0.4, 1],
      [0, 0.2, 0],
      Extrapolation.CLAMP
    );

    return {
      transform: [{ scale }],
      opacity,
      borderColor: color,
    };
  });

  return <Animated.View style={[styles.radarCircle, animatedStyle]} />;
};

const DeviceNode = ({
  label,
  image,
  initials,
  icon,
  top,
  left,
  delay = 0,
}: {
  label: string;
  image?: any;
  initials?: string;
  icon?: string;
  top: DimensionValue;
  left: DimensionValue;
  delay?: number;
}) => {
  const colorScheme = useColorScheme() ?? 'light';
  const themeColors = Colors[colorScheme];

  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.8);

  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration: 800 }));
    scale.value = withDelay(
      delay,
      withTiming(1, { duration: 800, easing: Easing.out(Easing.back(1.5)) })
    );
  }, [delay, opacity, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[styles.deviceNode, { top, left }, animatedStyle]}>
      <View
        style={[
          styles.nodeIconContainer,
          {
            backgroundColor: themeColors.surface,
            borderColor: themeColors.border,
          },
        ]}
      >
        {image ? (
          <Image source={{ uri: image }} style={styles.nodeImage} />
        ) : initials ? (
          <Text style={[styles.nodeInitials, { color: themeColors.text }]}>
            {initials}
          </Text>
        ) : icon ? (
          <IconSymbol name={icon as any} size={20} color={themeColors.text} />
        ) : null}
      </View>
      <Text style={[styles.nodeLabel, { color: themeColors.mutedText }]}>
        {label.toUpperCase()}
      </Text>
    </Animated.View>
  );
};

const LoadingDot = ({ delay, color }: { delay: number; color: string }) => {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withDelay(
      delay,
      withRepeat(
        withTiming(1, { duration: 600, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      )
    );
  }, [delay, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[styles.dot, { backgroundColor: color }, animatedStyle]}
    />
  );
};

export default function SearchingScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const themeColors = Colors[colorScheme];

  return (
    <View
      style={[styles.container, { backgroundColor: themeColors.background }]}
    >
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => router.back()}
          >
            <IconSymbol name="xmark" size={24} color={themeColors.text} />
          </TouchableOpacity>
        </View>

        {/* Content */}
        <View style={styles.content}>
          <View style={styles.radarContainer}>
            {[...Array(CIRCLE_COUNT)].map((_, i) => (
              <RadarCircle
                key={i}
                delay={i * 1000}
                color={themeColors.circleColor}
              />
            ))}

            <View
              style={[
                styles.centerIconContainer,
                { backgroundColor: themeColors.dark },
              ]}
            >
              <IconSymbol
                name="antenna.radiowaves.left.and.right"
                size={28}
                color={themeColors.light}
              />
            </View>

            {/* Device Nodes */}
            <DeviceNode
              label="Sarah"
              image="https://i.pravatar.cc/150?u=sarah"
              top="10%"
              left="15%"
              delay={500}
            />
            <DeviceNode
              label="Alex J."
              image="https://i.pravatar.cc/150?u=alex"
              top="55%"
              left="5%"
              delay={1200}
            />
            <DeviceNode
              label="MK"
              initials="MK"
              top="50%"
              left="75%"
              delay={800}
            />
            <DeviceNode
              label="Ipad Air"
              initials="IA"
              top="75%"
              left="60%"
              delay={1500}
            />
            <DeviceNode
              label="Studio"
              icon="laptopcomputer"
              top="30%"
              left="85%"
              delay={2000}
            />
          </View>

          {/* Bottom Section */}
          <View style={styles.bottomSection}>
            <View style={styles.statusLabelContainer}>
              <View style={styles.loadingDots}>
                <LoadingDot delay={0} color={themeColors.text} />
                <LoadingDot delay={200} color={themeColors.text} />
                <LoadingDot delay={400} color={themeColors.text} />
              </View>
              <Text style={[styles.statusTitle, { color: themeColors.text }]}>
                Searching for nearby devices
              </Text>
            </View>

            <Text
              style={[styles.statusSubtitle, { color: themeColors.mutedText }]}
            >
              Ensure Bluetooth and Wi-Fi are enabled on both devices to start
              sharing.
            </Text>

            <View
              style={[
                styles.foundPill,
                {
                  backgroundColor: themeColors.surface,
                  borderColor: themeColors.border,
                },
              ]}
            >
              <View style={styles.avatarStack}>
                <Image
                  source={{ uri: 'https://i.pravatar.cc/150?u=1' }}
                  style={styles.stackedAvatar}
                />
                <Image
                  source={{ uri: 'https://i.pravatar.cc/150?u=2' }}
                  style={[styles.stackedAvatar, { marginLeft: -10 }]}
                />
                <View
                  style={[
                    styles.countBadge,
                    { backgroundColor: 'blue', marginLeft: -10 },
                  ]}
                >
                  <Text style={styles.countBadgeText}>+3</Text>
                </View>
              </View>
              <Text
                style={[styles.foundText, { color: themeColors.mutedText }]}
              >
                5 FOUND
              </Text>
            </View>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    height: 60,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    alignItems: 'center',
  },
  radarContainer: {
    width: '100%',
    height: 400,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 40,
  },
  radarCircle: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 1,
  },
  centerIconContainer: {
    width: 70,
    height: 70,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    borderWidth: 0,
    // Add a subtle glow for the center
    shadowColor: '#FFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 5,
  },
  deviceNode: {
    position: 'absolute',
    alignItems: 'center',
    zIndex: 20,
  },
  nodeIconContainer: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    marginBottom: 8,
  },
  nodeImage: {
    width: '100%',
    height: '100%',
  },
  nodeInitials: {
    fontSize: 16,
    fontFamily: Fonts.sans.bold,
  },
  nodeLabel: {
    fontSize: 10,
    fontFamily: Fonts.sans.medium,
    letterSpacing: 1,
  },
  bottomSection: {
    width: '100%',
    paddingHorizontal: 40,
    alignItems: 'center',
    marginTop: 'auto',
    paddingBottom: 40,
  },
  statusLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  loadingDots: {
    flexDirection: 'row',
    gap: 4,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  statusTitle: {
    fontSize: 16,
    textAlign: 'center',
    fontFamily: Fonts.sans.regular,
    letterSpacing: 1,
  },
  statusSubtitle: {
    fontSize: 14,
    fontFamily: Fonts.sans.regular,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
    opacity: 0.8,
  },
  foundPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 25,
    borderWidth: 1,
    gap: 12,
  },
  avatarStack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stackedAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#000',
  },
  countBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#000',
  },
  countBadgeText: {
    color: '#FFF',
    fontSize: 10,
    fontFamily: Fonts.sans.bold,
  },
  foundText: {
    fontSize: 12,
    fontFamily: Fonts.sans.bold,
    letterSpacing: 1,
  },
});
