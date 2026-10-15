import React, { useMemo, useState } from 'react';
import Crossshare from '@crossshare/core';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  Pressable,
  TextInput,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/context/theme-context';
import { formatSize, useCrossshare } from '@/context/crossshare-context';

export default function ProfileScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const themeColors = Colors[colorScheme];
  const { themeMode, setThemeMode } = useTheme();
  const [isThemeModalVisible, setThemeModalVisible] = useState(false);
  const { device, rename, history, clearHistory, bluetooth } = useCrossshare();
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(device.name);

  const completed = history.filter((h) => h.status === 'completed');
  const totalShared = completed.reduce(
    (acc, h) => acc + h.files.reduce((a, f) => a + f.size, 0),
    0
  );
  const wifiAware = useMemo(() => Crossshare.isWifiAwareSupported(), []);
  const pair = async (mode: 'show' | 'find') => {
    try {
      await Crossshare.pairWifiAware(mode);
    } catch (e: any) {
      Alert.alert('Pairing failed', e?.message ?? String(e));
    }
  };

  const saveName = () => {
    setEditing(false);
    if (draftName.trim()) rename(draftName.trim());
    else setDraftName(device.name);
  };

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
            {editing ? (
              <TextInput
                value={draftName}
                onChangeText={setDraftName}
                onBlur={saveName}
                onSubmitEditing={saveName}
                autoFocus
                maxLength={60}
                returnKeyType="done"
                style={[
                  styles.userName,
                  styles.nameInput,
                  { color: themeColors.text, borderColor: themeColors.border },
                ]}
              />
            ) : (
              <TouchableOpacity
                style={styles.nameRow}
                onPress={() => {
                  setDraftName(device.name);
                  setEditing(true);
                }}
              >
                <Text style={[styles.userName, { color: themeColors.text }]}>
                  {device.name}
                </Text>
                <IconSymbol
                  name="pencil"
                  size={16}
                  color={themeColors.mutedText}
                />
              </TouchableOpacity>
            )}
            <Text style={[styles.deviceInfo, { color: themeColors.mutedText }]}>
              NAME OTHERS SEE · BLUETOOTH {bluetooth.toUpperCase()}
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
                {formatSize(totalShared)}
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
                TRANSFERS
              </Text>
              <Text style={[styles.statValue, { color: themeColors.text }]}>
                {completed.length}
              </Text>
            </View>
          </View>

          <View
            style={[
              styles.divider,
              { backgroundColor: themeColors.divider, marginTop: 0 },
            ]}
          />

          {wifiAware && (
            <View style={styles.awareSection}>
              <Text
                style={[styles.awareTitle, { color: themeColors.mutedText }]}
              >
                WI-FI AWARE
              </Text>
              <Text
                style={[styles.awareText, { color: themeColors.mutedText }]}
              >
                Pair once with another iPhone for fast, direct transfers
                anywhere. One device shows a code, the other enters it.
              </Text>
              <View style={styles.awareButtons}>
                <TouchableOpacity
                  style={[
                    styles.awareButton,
                    { borderColor: themeColors.border },
                  ]}
                  onPress={() => pair('show')}
                >
                  <Text
                    style={[styles.signOutText, { color: themeColors.text }]}
                  >
                    SHOW CODE
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.awareButton,
                    { borderColor: themeColors.border },
                  ]}
                  onPress={() => pair('find')}
                >
                  <Text
                    style={[styles.signOutText, { color: themeColors.text }]}
                  >
                    ENTER CODE
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <Text style={[styles.note, { color: themeColors.mutedText }]}>
            {Platform.OS === 'ios'
              ? 'Received files are saved in Files › On My iPhone › Crossshare.'
              : 'Received files are saved in Downloads › Crossshare.'}
          </Text>

          <TouchableOpacity
            style={[styles.signOutButton, { borderColor: themeColors.border }]}
            onPress={() =>
              Alert.alert('Clear history?', 'Received files are kept.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Clear', style: 'destructive', onPress: clearHistory },
              ])
            }
          >
            <Text style={[styles.signOutText, { color: themeColors.text }]}>
              CLEAR HISTORY
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
  awareSection: {
    marginHorizontal: 24,
    marginTop: 30,
  },
  awareTitle: {
    fontSize: 11,
    fontFamily: Fonts.sans.bold,
    letterSpacing: 2,
    marginBottom: 8,
  },
  awareText: {
    fontSize: 13,
    fontFamily: Fonts.sans.regular,
    lineHeight: 19,
    marginBottom: 14,
  },
  awareButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  awareButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 24,
    paddingVertical: 12,
    alignItems: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  nameInput: {
    borderBottomWidth: 1,
    minWidth: 200,
    textAlign: 'center',
    paddingVertical: 2,
  },
  note: {
    fontSize: 12,
    fontFamily: Fonts.sans.regular,
    textAlign: 'center',
    marginHorizontal: 30,
    marginTop: 30,
    lineHeight: 18,
  },
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
