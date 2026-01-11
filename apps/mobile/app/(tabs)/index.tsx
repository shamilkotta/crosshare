import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Modal,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { PlusAnimatedCircles } from '@/components/plus-animated-circles';
import { SegmentedControl } from '@/components/segmented-control';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Fonts } from '@/constants/theme';
import { useTheme } from '@/context/theme-context';

export default function HomeScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const themeColors = Colors[colorScheme];
  const { themeMode, setThemeMode } = useTheme();
  const [isThemeModalVisible, setThemeModalVisible] = useState(false);
  const [sharingMode, setSharingMode] = useState('EVERYONE');
  const router = useRouter();

  const ThemeOption = ({
    mode,
    label,
  }: {
    mode: 'light' | 'dark' | 'system';
    label: string;
  }) => (
    <TouchableOpacity
      style={[
        styles.themeOption,
        themeMode === mode && styles.activeThemeOption,
      ]}
      onPress={() => {
        setThemeMode(mode);
        setThemeModalVisible(false);
      }}
    >
      <Text
        style={[
          styles.themeOptionText,
          {
            color: themeColors.text,
            fontFamily:
              themeMode === mode ? Fonts.sans.bold : Fonts.sans.regular,
          },
        ]}
      >
        {label}
      </Text>
      {themeMode === mode && <View style={styles.activeCheck} />}
    </TouchableOpacity>
  );

  return (
    <View
      style={[styles.container, { backgroundColor: themeColors.background }]}
    >
      <SafeAreaView style={styles.safeArea}>
        {/* Top Navigation */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerButton}>
            <View
              style={[
                styles.profileIconContainer,
                { borderColor: themeColors.text },
              ]}
            >
              <IconSymbol
                name="person.fill"
                size={18}
                color={themeColors.text}
              />
            </View>
          </TouchableOpacity>

          <View style={styles.centerNav}>
            <View style={styles.navItemContainer}>
              <Text style={[styles.navText, { color: themeColors.text }]}>
                SEND
              </Text>
              <View
                style={[
                  styles.activeDot,
                  { backgroundColor: themeColors.text },
                ]}
              />
            </View>
            <TouchableOpacity style={styles.navItemContainer}>
              <Text style={[styles.navText, { color: themeColors.mutedText }]}>
                HISTORY
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.headerPlaceholder} />
        </View>

        {/* Central Content */}
        <View style={styles.content}>
          <PlusAnimatedCircles onPress={() => router.push('/searching')} />

          <View style={styles.textContainer}>
            <Text style={[styles.selectFilesText, { color: themeColors.text }]}>
              Select Files
            </Text>
            <Text
              style={[styles.maxTransferText, { color: themeColors.mutedText }]}
            >
              Maximum 2GB per transfer
            </Text>
          </View>
        </View>

        <View style={styles.statusContainer}>
          <SegmentedControl
            options={['OFF', 'CONTACTS', 'EVERYONE']}
            selectedOption={sharingMode}
            onSelect={setSharingMode}
          />
          <Text style={[styles.readyText, { color: themeColors.subtleText }]}>
            READY TO TRANSFER
          </Text>
        </View>

        {/* Bottom Navigation / Indicators */}
        {/* <View style={styles.footer}>
          <View style={styles.pagination}>
            <View style={[styles.dot, { backgroundColor: themeColors.text }]} />
            <View style={[styles.dot, { backgroundColor: themeColors.border }]} />
            <View style={[styles.dot, { backgroundColor: themeColors.border }]} />
          </View>
          <Text style={[styles.stepText, { color: themeColors.subtleText }]}>STEP 1 OF 3</Text>
        </View> */}

        {/* Theme Selection Modal */}
        <Modal
          animationType="fade"
          transparent={true}
          visible={isThemeModalVisible}
          onRequestClose={() => setThemeModalVisible(false)}
        >
          <Pressable
            style={styles.modalOverlay}
            onPress={() => setThemeModalVisible(false)}
          >
            <View
              style={[
                styles.modalContent,
                {
                  backgroundColor: themeColors.background,
                  borderColor: themeColors.border,
                },
              ]}
            >
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>
                Select Theme
              </Text>
              <ThemeOption mode="light" label="White (Light)" />
              <ThemeOption mode="dark" label="Dark" />
              <ThemeOption mode="system" label="System" />
            </View>
          </Pressable>
        </Modal>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    height: 60,
  },
  headerPlaceholder: {
    width: 40,
  },
  headerButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    opacity: 0.8,
  },
  centerNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 30,
  },
  navItemContainer: {
    alignItems: 'center',
  },
  navText: {
    fontSize: 14,
    fontFamily: Fonts.sans.semiBold,
    letterSpacing: 2,
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 6,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textContainer: {
    alignItems: 'center',
    marginTop: 40,
  },
  selectFilesText: {
    fontSize: 24,
    fontFamily: Fonts.sans.regular,
    letterSpacing: 4,
  },
  maxTransferText: {
    fontSize: 12,
    marginTop: 10,
    fontFamily: Fonts.sans.regular,
  },
  statusContainer: {
    paddingBottom: 40,
    alignItems: 'center',
    gap: 30,
  },
  readyText: {
    fontSize: 10,
    fontFamily: Fonts.sans.bold,
    letterSpacing: 3,
    opacity: 0.6,
  },
  footer: {
    paddingBottom: 40,
    alignItems: 'center',
  },
  pagination: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  stepText: {
    fontSize: 12,
    letterSpacing: 2,
    fontFamily: Fonts.sans.medium,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '80%',
    padding: 20,
    borderRadius: 15,
    borderWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: Fonts.sans.bold,
    marginBottom: 20,
    textAlign: 'center',
  },
  themeOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  activeThemeOption: {
    // Optional active style
  },
  themeOptionText: {
    fontSize: 16,
  },
  activeThemeOptionText: {
    fontWeight: '700',
  },
  activeCheck: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#0a7ea4',
  },
});
