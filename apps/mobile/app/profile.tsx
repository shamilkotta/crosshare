import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/context/theme-context';

const ContactItem = ({
  name,
  themeColors,
}: {
  name: string;
  themeColors: any;
}) => (
  <View style={[styles.contactItem, { borderColor: themeColors.divider }]}>
    <View style={styles.contactLeft}>
      <View
        style={[styles.contactAvatar, { backgroundColor: themeColors.surface }]}
      >
        <IconSymbol name="person.fill" size={16} color={themeColors.text} />
      </View>
      <Text style={[styles.contactName, { color: themeColors.text }]}>
        {name}
      </Text>
    </View>
    <TouchableOpacity style={styles.removeButton}>
      <IconSymbol name="xmark" size={16} color={themeColors.mutedText} />
    </TouchableOpacity>
  </View>
);

export default function ProfileScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const themeColors = Colors[colorScheme];
  const { themeMode, setThemeMode } = useTheme();
  const [isThemeModalVisible, setThemeModalVisible] = useState(false);

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
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <IconSymbol name="arrow.left" size={24} color={themeColors.text} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.settingsButton}
            onPress={() => setThemeModalVisible(true)}
          >
            <IconSymbol name="gearshape" size={24} color={themeColors.text} />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Main Profile Info */}
          <View style={styles.profileInfo}>
            <View
              style={[
                styles.avatarContainer,
                { borderColor: themeColors.border },
              ]}
            >
              <IconSymbol
                name="person.fill"
                size={48}
                color={themeColors.text}
              />
            </View>
            <Text style={[styles.userName, { color: themeColors.text }]}>
              Alex Johnson
            </Text>
            <Text style={[styles.deviceInfo, { color: themeColors.mutedText }]}>
              IPHONE 15 PRO
            </Text>
          </View>

          <View
            style={[
              styles.divider,
              { backgroundColor: themeColors.divider, marginBottom: 0 },
            ]}
          />

          {/* Stats */}
          <View style={styles.statsContainer}>
            <View style={styles.statBox}>
              <Text
                style={[styles.statLabel, { color: themeColors.mutedText }]}
              >
                TOTAL SHARED
              </Text>
              <Text style={[styles.statValue, { color: themeColors.text }]}>
                4.2 GB
              </Text>
            </View>
            <View
              style={[
                styles.statDivider,
                { backgroundColor: themeColors.border },
              ]}
            />
            <View style={styles.statBox}>
              <Text
                style={[styles.statLabel, { color: themeColors.mutedText }]}
              >
                CONNECTED
              </Text>
              <Text style={[styles.statValue, { color: themeColors.text }]}>
                2
              </Text>
            </View>
          </View>

          <View
            style={[
              styles.divider,
              { backgroundColor: themeColors.divider, marginTop: 0 },
            ]}
          />

          {/* Contacts Section */}
          <View style={styles.sectionHeader}>
            <Text
              style={[styles.sectionTitle, { color: themeColors.mutedText }]}
            >
              CONTACTS
            </Text>
            <Text
              style={[styles.sectionCount, { color: themeColors.mutedText }]}
            >
              3 Total
            </Text>
          </View>

          <View style={styles.contactsList}>
            <ContactItem name="Sarah Miller" themeColors={themeColors} />
            <ContactItem name="Marcus Chen" themeColors={themeColors} />
            <ContactItem name="Elena Rodriguez" themeColors={themeColors} />
          </View>

          {/* Sign Out Button */}
          <TouchableOpacity
            style={[styles.signOutButton, { borderColor: themeColors.border }]}
          >
            <Text style={[styles.signOutText, { color: themeColors.text }]}>
              SIGN OUT
            </Text>
          </TouchableOpacity>
        </ScrollView>

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
              <ThemeOption mode="light" label="Light" />
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
    height: 60,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingsButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingHorizontal: 40,
    alignItems: 'center',
    paddingBottom: 60,
    width: '100%',
  },
  profileInfo: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 30,
  },
  avatarContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'transparent',
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  userName: {
    fontSize: 22,
    fontFamily: Fonts.sans.bold,
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  deviceInfo: {
    fontSize: 11,
    fontFamily: Fonts.sans.medium,
    letterSpacing: 3,
  },
  divider: {
    width: '100%',
    height: 1,
    marginVertical: 30,
  },
  statsContainer: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 15,
  },
  statBox: {
    alignItems: 'center',
    flex: 1,
  },
  statDivider: {
    width: 1,
    height: 30,
  },
  statLabel: {
    fontSize: 10,
    fontFamily: Fonts.sans.bold,
    letterSpacing: 2,
    marginBottom: 8,
  },
  statValue: {
    fontSize: 20,
    fontFamily: Fonts.sans.medium,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 20,
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: Fonts.sans.bold,
    letterSpacing: 3,
  },
  sectionCount: {
    fontSize: 10,
    fontFamily: Fonts.sans.regular,
  },
  contactsList: {
    width: '100%',
    gap: 5,
  },
  contactItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 0.5,
  },
  contactLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
  },
  contactAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contactName: {
    fontSize: 16,
    fontFamily: Fonts.sans.regular,
  },
  removeButton: {
    padding: 8,
  },
  signOutButton: {
    width: '80%',
    height: 50,
    borderRadius: 25,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 60,
  },
  signOutText: {
    fontSize: 11,
    fontFamily: Fonts.sans.bold,
    letterSpacing: 4,
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
    borderBottomWidth: 0,
  },
  activeThemeOption: {
    // Optional active style
  },
  themeOptionText: {
    fontSize: 16,
  },
  activeCheck: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#0a7ea4',
  },
});
