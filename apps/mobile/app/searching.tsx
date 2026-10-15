import React, { useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Image,
  DimensionValue,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useCrossshare } from '@/context/crossshare-context';
import { NearbyDevicesModal } from '@/components/nearby-devices-modal';
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
  sublabel,
  image,
  initials,
  icon,
  top,
  left,
  delay = 0,
  onPress,
}: {
  label: string;
  sublabel?: string;
  image?: any;
  initials?: string;
  icon?: string;
  top: DimensionValue;
  left: DimensionValue;
  delay?: number;
  onPress?: () => void;
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
      <TouchableOpacity onPress={onPress} style={styles.nodeTouch}>
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
        <Text
          style={[styles.nodeLabel, { color: themeColors.text }]}
          numberOfLines={1}
        >
          {label.toUpperCase()}
        </Text>
        {sublabel ? (
          <Text style={[styles.nodeSublabel, { color: themeColors.mutedText }]}>
            {sublabel}
          </Text>
        ) : null}
      </TouchableOpacity>
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

const POSITIONS = [
  { top: '10%', left: '15%' },
  { top: '55%', left: '5%' },
  { top: '50%', left: '72%' },
  { top: '78%', left: '40%' },
  { top: '15%', left: '68%' },
];

const platformIcon = (p: string) =>
  p === 'macos' ? 'desktopcomputer' : 'iphone';

export default function SearchingScreen() {
  const router = useRouter();
  const [isModalVisible, setIsModalVisible] = React.useState(false);
  const colorScheme = useColorScheme() ?? 'light';
  const themeColors = Colors[colorScheme];
  const { peers, setDiscovering, selection, setSelection, send, bluetooth } =
    useCrossshare();
  const [sendingTo, setSendingTo] = React.useState<Set<string>>(new Set());

  useEffect(() => {
    setDiscovering(true);
    return () => setDiscovering(false);
  }, [setDiscovering]);

  const devices = peers.map((peer) => ({
    id: peer.id,
    name: peer.name,
    icon: platformIcon(peer.platform),
    status: sendingTo.has(peer.id)
      ? 'SENT'
      : peer.routes.includes('wifi')
        ? 'WI-FI'
        : peer.routes.includes('aware')
          ? 'WI-FI AWARE'
          : 'BLUETOOTH',
  }));

  const sendTo = async (peerId: string) => {
    if (!selection || sendingTo.has(peerId)) return;
    setSendingTo((prev) => new Set(prev).add(peerId));
    try {
      await send(peerId, selection);
    } catch (e: any) {
      Alert.alert('Could not send', e?.message ?? String(e));
      setSendingTo((prev) => {
        const next = new Set(prev);
        next.delete(peerId);
        return next;
      });
    }
  };

  const close = () => {
    setSelection(null);
    router.back();
  };

  const summary = !selection
    ? ''
    : selection.files.length === 0
      ? 'Sending text'
      : selection.files.length === 1
        ? `Sending ${selection.files[0].name}`
        : `Sending ${selection.files.length} files`;

  return (
    <View
      style={[styles.container, { backgroundColor: themeColors.background }]}
    >
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.closeButton} onPress={close}>
            <IconSymbol name="xmark" size={24} color={themeColors.text} />
          </TouchableOpacity>
          <Text
            style={[styles.summary, { color: themeColors.mutedText }]}
            numberOfLines={1}
          >
            {summary}
          </Text>
          <View style={styles.closeButton} />
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

            {devices.slice(0, POSITIONS.length).map((device, index) => {
              const pos = POSITIONS[index];
              return (
                <DeviceNode
                  key={device.id}
                  label={device.name}
                  sublabel={device.status}
                  icon={device.icon}
                  top={pos.top as DimensionValue}
                  left={pos.left as DimensionValue}
                  delay={index * 150}
                  onPress={() => sendTo(device.id)}
                />
              );
            })}
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
                {devices.length === 0
                  ? 'Searching for nearby devices'
                  : 'Tap a device to send'}
              </Text>
            </View>

            <Text
              style={[styles.statusSubtitle, { color: themeColors.mutedText }]}
            >
              {bluetooth === 'on'
                ? 'Keep Crossshare open on the other device. No shared Wi-Fi needed.'
                : 'Turn on Bluetooth to find devices that are not on your Wi-Fi.'}
            </Text>

            <TouchableOpacity
              onPress={() => setIsModalVisible(true)}
              disabled={devices.length === 0}
              style={[
                styles.foundPill,
                {
                  backgroundColor: themeColors.surface,
                  borderColor: themeColors.border,
                },
              ]}
            >
              <Text
                style={[styles.foundText, { color: themeColors.mutedText }]}
              >
                {devices.length} FOUND
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <NearbyDevicesModal
          isVisible={isModalVisible}
          onClose={() => setIsModalVisible(false)}
          devices={devices}
          onSend={sendTo}
          sent={sendingTo}
        />
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summary: {
    flex: 1,
    textAlign: 'center',
    fontSize: 13,
    fontFamily: Fonts.sans.medium,
  },
  nodeTouch: {
    alignItems: 'center',
    maxWidth: 110,
  },
  nodeSublabel: {
    fontSize: 9,
    fontFamily: Fonts.sans.medium,
    letterSpacing: 1,
    marginTop: 2,
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
  foundText: {
    fontSize: 12,
    fontFamily: Fonts.sans.bold,
    letterSpacing: 1,
  },
});
