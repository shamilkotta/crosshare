import React, { useEffect } from 'react';
import {
  StyleSheet,
  View,
  TouchableOpacity,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  interpolate,
  Extrapolation,
  runOnJS,
} from 'react-native-reanimated';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import { Fonts } from '@/constants/theme';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const MAX_TRANSLATE_Y = -SCREEN_HEIGHT * 0.7;

interface Device {
  id: string;
  name: string;
  initials?: string;
  icon?: string;
  status: string;
}

interface NearbyDevicesModalProps {
  isVisible: boolean;
  onClose: () => void;
  devices: Device[];
  onSend: (deviceId: string) => void;
  sent: Set<string>;
}

export function NearbyDevicesModal({
  isVisible,
  onClose,
  devices,
  onSend,
  sent,
}: NearbyDevicesModalProps) {
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(0);
  const context = useSharedValue({ y: 0 });
  const [showModal, setShowModal] = React.useState(isVisible);

  const backgroundColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');
  const mutedTextColor = useThemeColor({}, 'mutedText');
  const surfaceColor = useThemeColor({}, 'surface');
  const borderColor = useThemeColor({}, 'border');
  const darkColor = useThemeColor({}, 'dark');
  const lightColor = useThemeColor({}, 'light');

  const scrollTo = (destination: number, callback?: () => void) => {
    'worklet';
    translateY.value = withTiming(
      destination,
      { duration: 300 },
      (finished) => {
        if (finished && callback) {
          runOnJS(callback)();
        }
      }
    );
  };

  useEffect(() => {
    if (isVisible) {
      setShowModal(true);
      translateY.value = withTiming(-SCREEN_HEIGHT * 0.6, { duration: 300 });
    } else {
      translateY.value = withTiming(0, { duration: 300 }, (finished) => {
        if (finished) {
          runOnJS(setShowModal)(false);
        }
      });
    }
  }, [isVisible]);

  const handleClose = () => {
    onClose();
  };

  const gesture = Gesture.Pan()
    .onStart(() => {
      context.value = { y: translateY.value };
    })
    .onUpdate((event) => {
      translateY.value = event.translationY + context.value.y;
      translateY.value = Math.max(
        translateY.value,
        -SCREEN_HEIGHT + insets.top
      );
    })
    .onEnd(() => {
      if (translateY.value > -SCREEN_HEIGHT * 0.45) {
        runOnJS(onClose)();
      } else if (translateY.value < -SCREEN_HEIGHT * 0.75) {
        translateY.value = withTiming(-SCREEN_HEIGHT + insets.top, {
          duration: 300,
        });
      } else {
        translateY.value = withTiming(-SCREEN_HEIGHT * 0.6, { duration: 300 });
      }
    });

  const rBottomSheetStyle = useAnimatedStyle(() => {
    const borderRadius = interpolate(
      translateY.value,
      [-SCREEN_HEIGHT + insets.top, -SCREEN_HEIGHT * 0.6],
      [0, 40],
      Extrapolation.CLAMP
    );

    return {
      borderRadius,
      transform: [{ translateY: translateY.value }],
    };
  });

  const rBackdropStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(
        translateY.value,
        [0, -SCREEN_HEIGHT * 0.6],
        [0, 1],
        Extrapolation.CLAMP
      ),
    };
  });

  return (
    <Modal visible={showModal} transparent animationType="none">
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Pressable style={styles.container} onPress={handleClose}>
          <Animated.View
            style={[
              styles.backdrop,
              { backgroundColor: 'rgba(0,0,0,0.5)' },
              rBackdropStyle,
            ]}
          />
          <GestureDetector gesture={gesture}>
            <Animated.View
              style={[
                styles.bottomSheetContainer,
                { backgroundColor, borderColor },
                rBottomSheetStyle,
              ]}
            >
              <View style={[styles.line, { backgroundColor: borderColor }]} />

              <View style={styles.header}>
                <ThemedText style={styles.title}>Nearby Devices</ThemedText>
                <ThemedText style={[styles.badgeText, { color: darkColor }]}>
                  {devices.length} FOUND
                </ThemedText>
              </View>

              <ScrollView
                style={styles.scrollView}
                contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
                showsVerticalScrollIndicator={false}
              >
                {devices.map((device) => (
                  <View key={device.id} style={styles.deviceItem}>
                    <View
                      style={[
                        styles.deviceIconContainer,
                        { backgroundColor: surfaceColor, borderColor },
                      ]}
                    >
                      {device.icon ? (
                        <IconSymbol
                          name={device.icon as any}
                          size={22}
                          color={textColor}
                        />
                      ) : (
                        <ThemedText style={styles.initials}>
                          {device.initials}
                        </ThemedText>
                      )}
                    </View>
                    <View style={styles.deviceInfo}>
                      <ThemedText style={styles.deviceName}>
                        {device.name}
                      </ThemedText>
                      <ThemedText
                        style={[styles.deviceStatus, { color: mutedTextColor }]}
                      >
                        {device.status}
                      </ThemedText>
                    </View>
                    <TouchableOpacity
                      disabled={sent.has(device.id)}
                      onPress={() => onSend(device.id)}
                      style={[
                        styles.sendButton,
                        {
                          backgroundColor: darkColor,
                          opacity: sent.has(device.id) ? 0.4 : 1,
                        },
                      ]}
                    >
                      <ThemedText
                        style={[styles.sendButtonText, { color: lightColor }]}
                      >
                        {sent.has(device.id) ? 'Sent' : 'Send'}
                      </ThemedText>
                    </TouchableOpacity>
                  </View>
                ))}

                <ThemedText
                  style={[styles.footerText, { color: mutedTextColor }]}
                >
                  THE OTHER DEVICE NEEDS CROSSSHARE OPEN
                </ThemedText>
              </ScrollView>
            </Animated.View>
          </GestureDetector>
        </Pressable>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  bottomSheetContainer: {
    height: SCREEN_HEIGHT,
    width: '100%',
    position: 'absolute',
    top: SCREEN_HEIGHT,
    borderWidth: 1,
  },
  line: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginVertical: 15,
    opacity: 0.5,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontFamily: Fonts.sans.bold,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 9,
    fontFamily: Fonts.sans.bold,
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 20,
  },
  deviceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 18,
    marginBottom: 10,
    backgroundColor: 'rgba(0,0,0,0.02)', // Minimal contrast
  },
  deviceIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    marginRight: 14,
  },
  initials: {
    fontSize: 14,
    fontFamily: Fonts.sans.bold,
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    fontSize: 15,
    fontFamily: Fonts.sans.bold,
  },
  deviceStatus: {
    fontSize: 11,
    fontFamily: Fonts.sans.medium,
    textTransform: 'uppercase',
  },
  sendButton: {
    paddingHorizontal: 14,
    paddingVertical: 3,
    borderRadius: 16,
  },
  sendButtonText: {
    fontSize: 13,
    fontFamily: Fonts.sans.bold,
  },
  footerText: {
    textAlign: 'center',
    fontSize: 10,
    fontFamily: Fonts.sans.medium,
    letterSpacing: 1,
    marginTop: 30,
    marginBottom: 20,
  },
});
