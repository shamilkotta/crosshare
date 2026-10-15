import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Fonts } from '@/constants/theme';
import * as Clipboard from 'expo-clipboard';
import Crosshare from '@crosshare/core';
import {
  HistoryEntry,
  formatSize,
  useCrosshare,
} from '@/context/crosshare-context';

const iconFor = (entry: HistoryEntry) => {
  if (entry.files.length === 0) return 'text.alignleft';
  if (entry.files.length > 1) return 'doc.on.doc';
  const ext = entry.files[0].name.split('.').pop()?.toLowerCase() ?? '';
  if (['jpg', 'jpeg', 'png', 'heic', 'gif', 'webp'].includes(ext))
    return 'photo.fill';
  if (['mp4', 'mov', 'mkv', 'webm'].includes(ext)) return 'video.fill';
  if (['mp3', 'wav', 'm4a', 'aac', 'flac'].includes(ext)) return 'music.note';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'archive.fill';
  return 'doc.fill';
};

const formatDate = (ms: number) =>
  new Date(ms)
    .toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
    .toUpperCase();

const HistoryItem = ({ entry }: { entry: HistoryEntry }) => {
  const colorScheme = useColorScheme() ?? 'light';
  const themeColors = Colors[colorScheme];
  const title =
    entry.files.length === 0
      ? (entry.text ?? '')
      : entry.files.length === 1
        ? entry.files[0].name
        : `${entry.files.length} files`;
  const size = entry.files.reduce((a, f) => a + f.size, 0);
  const subtitle = `${entry.direction === 'incoming' ? 'FROM' : 'TO'}: ${entry.peerName.toUpperCase()}${
    entry.files.length > 0 ? ` · ${formatSize(size)}` : ''
  }${entry.status === 'completed' ? '' : ` · ${entry.status.toUpperCase()}`}`;
  const uri = entry.files.find((f) => f.uri)?.uri;

  const onPress = () => {
    if (uri) Crosshare.openFile(uri);
    else if (entry.text) Clipboard.setStringAsync(entry.text);
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!uri && !entry.text}
      style={[styles.historyItem, { borderBottomColor: themeColors.divider }]}
    >
      <View
        style={[styles.iconContainer, { backgroundColor: themeColors.surface }]}
      >
        <IconSymbol
          name={iconFor(entry) as any}
          size={22}
          color={themeColors.text}
        />
      </View>
      <View style={styles.itemContent}>
        <Text
          style={[styles.itemTitle, { color: themeColors.text }]}
          numberOfLines={1}
        >
          {title}
        </Text>
        <Text
          style={[styles.itemSubtitle, { color: themeColors.mutedText }]}
          numberOfLines={1}
        >
          {subtitle}
        </Text>
      </View>
      <View style={styles.itemRight}>
        <Text style={[styles.itemDate, { color: themeColors.mutedText }]}>
          {formatDate(entry.date)}
        </Text>
        {entry.status === 'completed' && (
          <IconSymbol
            name="checkmark.circle.fill"
            size={16}
            color={themeColors.text}
            style={styles.checkmark}
          />
        )}
      </View>
    </TouchableOpacity>
  );
};

export default function HistoryScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const themeColors = Colors[colorScheme];
  const { history } = useCrosshare();

  return (
    <View
      style={[styles.container, { backgroundColor: themeColors.background }]}
    >
      <SafeAreaView style={styles.safeArea}>
        {/* Top Navigation */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => router.push('/profile')}
          >
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
            <TouchableOpacity
              style={styles.navItemContainer}
              onPress={() => router.push('/')}
            >
              <Text style={[styles.navText, { color: themeColors.mutedText }]}>
                SEND
              </Text>
            </TouchableOpacity>
            <View style={styles.navItemContainer}>
              <Text style={[styles.navText, { color: themeColors.text }]}>
                HISTORY
              </Text>
              <View
                style={[
                  styles.activeDot,
                  { backgroundColor: themeColors.text },
                ]}
              />
            </View>
          </View>

          <View style={styles.headerPlaceholder} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          {history.length === 0 ? (
            <Text style={[styles.empty, { color: themeColors.mutedText }]}>
              Nothing shared yet
            </Text>
          ) : (
            history.map((entry) => <HistoryItem key={entry.id} entry={entry} />)
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    textAlign: 'center',
    marginTop: 80,
    fontSize: 14,
    fontFamily: Fonts.sans.regular,
  },
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
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 18,
    borderBottomWidth: 0.5,
  },
  iconContainer: {
    width: 50,
    height: 50,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  itemContent: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 16,
    fontFamily: Fonts.sans.medium,
    marginBottom: 4,
  },
  itemSubtitle: {
    fontSize: 12,
    fontFamily: Fonts.sans.bold,
    opacity: 0.6,
  },
  itemRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemDate: {
    fontSize: 11,
    fontFamily: Fonts.sans.regular,
    opacity: 0.5,
  },
  checkmark: {
    marginLeft: 10,
    opacity: 0.8,
  },
});
