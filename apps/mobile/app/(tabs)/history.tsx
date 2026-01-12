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

const HistoryItem = ({
  icon,
  title,
  subtitle,
  date,
  isCheckmark = true,
}: {
  icon: string;
  title: string;
  subtitle: string;
  date: string;
  isCheckmark?: boolean;
}) => {
  const colorScheme = useColorScheme() ?? 'light';
  const themeColors = Colors[colorScheme];

  return (
    <View
      style={[styles.historyItem, { borderBottomColor: themeColors.divider }]}
    >
      <View
        style={[styles.iconContainer, { backgroundColor: themeColors.surface }]}
      >
        <IconSymbol name={icon as any} size={22} color={themeColors.text} />
      </View>
      <View style={styles.itemContent}>
        <Text style={[styles.itemTitle, { color: themeColors.text }]}>
          {title}
        </Text>
        <Text style={[styles.itemSubtitle, { color: themeColors.mutedText }]}>
          {subtitle}
        </Text>
      </View>
      <View style={styles.itemRight}>
        <Text style={[styles.itemDate, { color: themeColors.mutedText }]}>
          {date}
        </Text>
        {isCheckmark && (
          <IconSymbol
            name="checkmark.circle.fill"
            size={16}
            color={themeColors.text}
            style={styles.checkmark}
          />
        )}
      </View>
    </View>
  );
};

export default function HistoryScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const themeColors = Colors[colorScheme];

  const historyData = [
    {
      icon: 'doc.fill',
      title: 'presentation_final.pdf',
      subtitle: 'TO: SARAH JENKINS',
      date: 'OCT 24, 14:20',
    },
    {
      icon: 'photo.fill',
      title: 'IMG_9021.heic',
      subtitle: 'FROM: MICHAEL R.',
      date: 'OCT 23, 09:12',
    },
    {
      icon: 'archive.fill',
      title: 'source_assets.zip',
      subtitle: 'TO: CREATIVE TEAM',
      date: 'OCT 22, 18:45',
    },
    {
      icon: 'video.fill',
      title: 'vlog_edit_v2.mp4',
      subtitle: 'FROM: ALEX CHEN',
      date: 'OCT 21, 11:30',
    },
    {
      icon: 'music.note',
      title: 'interview_rec.wav',
      subtitle: 'TO: EDITOR',
      date: 'OCT 20, 16:15',
    },
  ];

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
          {historyData.map((item, index) => (
            <HistoryItem key={index} {...item} />
          ))}
        </ScrollView>
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
