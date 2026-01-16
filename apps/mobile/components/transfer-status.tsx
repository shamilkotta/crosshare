import React, { useState } from 'react';
import { StyleSheet, View, TouchableOpacity } from 'react-native';
import Animated, {
  FadeInUp,
  FadeOutUp,
  LinearTransition,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import { Fonts } from '@/constants/theme';
import {
  useTransfer,
  UserTransfer,
  FileTransfer,
} from '@/context/transfer-context';

const formatSize = (bytes: number) => {
  const mb = bytes / (1024 * 1024);
  return mb.toFixed(1) + ' MB';
};

export function TransferStatus() {
  const { activeSession, pendingRequest, cancelSession, respondToRequest } =
    useTransfer();
  const [isExpanded, setIsExpanded] = useState(false);
  const insets = useSafeAreaInsets();

  const backgroundColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');
  const mutedTextColor = useThemeColor({}, 'mutedText');
  const surfaceColor = useThemeColor({}, 'surface');
  const borderColor = useThemeColor({}, 'border');

  if (!activeSession && !pendingRequest) return null;

  if (pendingRequest) {
    return (
      <Animated.View
        entering={FadeInUp.duration(250)}
        exiting={FadeOutUp.duration(200)}
        layout={LinearTransition.duration(250)}
        style={[
          styles.container,
          {
            top: insets.top + 10,
            backgroundColor: backgroundColor,
            borderColor: borderColor,
          },
          styles.shadow,
        ]}
      >
        <View style={styles.content}>
          <View style={styles.header}>
            <View
              style={[styles.iconContainer, { backgroundColor: surfaceColor }]}
            >
              <IconSymbol
                name="tray.and.arrow.down.fill"
                size={18}
                color={textColor}
              />
            </View>
            <View style={styles.titleContainer}>
              <ThemedText style={styles.title} numberOfLines={1}>
                Incoming from {pendingRequest.senderDeviceName}
              </ThemedText>
              <ThemedText
                style={[styles.subtitle, { color: mutedTextColor }]}
                numberOfLines={1}
              >
                {pendingRequest.files.length}{' '}
                {pendingRequest.files.length === 1 ? 'file' : 'files'} •{' '}
                {formatSize(
                  pendingRequest.files.reduce((acc, f) => acc + f.size, 0)
                )}
              </ThemedText>
            </View>
          </View>

          <View style={styles.requestFooter}>
            <TouchableOpacity
              style={[
                styles.actionButton,
                { borderColor: borderColor, borderWidth: 1 },
              ]}
              onPress={() => respondToRequest(false)}
            >
              <ThemedText
                style={[styles.actionButtonText, { color: textColor }]}
              >
                DECLINE
              </ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: textColor }]}
              onPress={() => respondToRequest(true)}
            >
              <ThemedText
                style={[styles.actionButtonText, { color: backgroundColor }]}
              >
                ACCEPT
              </ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    );
  }

  // Active Session UI (Previously existing)
  const totalFiles = activeSession!.users.reduce(
    (acc, user) => acc + user.files.length,
    0
  );
  const totalUsers = activeSession!.users.length;

  const totalSizeBytes = activeSession!.users.reduce(
    (acc, user) => acc + user.files.reduce((fAcc, f) => fAcc + f.size, 0),
    0
  );
  const totalTransferredBytes = activeSession!.users.reduce(
    (acc, user) =>
      acc + user.files.reduce((fAcc, f) => fAcc + f.transferred, 0),
    0
  );

  const totalProgress =
    totalSizeBytes > 0 ? totalTransferredBytes / totalSizeBytes : 0;
  const percentage = Math.round(totalProgress * 100);

  const isMultiUser = totalUsers > 1;
  const isMultiFile = totalUsers === 1 && totalFiles > 1;
  const showChevron = isMultiUser || isMultiFile;

  const title = isMultiUser
    ? `Sharing to ${totalUsers} users`
    : isMultiFile
      ? `${totalFiles} files`
      : activeSession!.users[0].files[0].name;

  const subtitle = isMultiUser
    ? `${totalFiles} files total`
    : isMultiFile
      ? activeSession!.users[0].deviceName
      : activeSession!.users[0].deviceName.toUpperCase() +
        ` (${activeSession!.users[0].name})`;

  return (
    <Animated.View
      entering={FadeInUp.duration(250)}
      exiting={FadeOutUp.duration(200)}
      layout={LinearTransition.duration(250)}
      style={[
        styles.container,
        {
          top: insets.top + 10,
          backgroundColor: backgroundColor,
          borderColor: borderColor,
        },
        styles.shadow,
      ]}
    >
      <View style={styles.content}>
        <View style={styles.header}>
          <View
            style={[styles.iconContainer, { backgroundColor: surfaceColor }]}
          >
            <IconSymbol
              name={isMultiFile || isMultiUser ? 'doc.on.doc' : 'doc.fill'}
              size={18}
              color={textColor}
            />
          </View>
          <View style={styles.titleContainer}>
            <ThemedText style={styles.title} numberOfLines={1}>
              {title}
            </ThemedText>
            <ThemedText
              style={[styles.subtitle, { color: mutedTextColor }]}
              numberOfLines={1}
            >
              {subtitle}
            </ThemedText>
          </View>
          <ThemedText style={styles.percentage}>{percentage}%</ThemedText>
        </View>

        <View style={styles.progressRow}>
          <View
            style={[
              styles.progressBarContainer,
              { backgroundColor: surfaceColor },
            ]}
          >
            <Animated.View
              layout={LinearTransition}
              style={[
                styles.progressBar,
                { width: `${percentage}%`, backgroundColor: textColor },
              ]}
            />
          </View>
          {showChevron && (
            <TouchableOpacity
              onPress={() => setIsExpanded(!isExpanded)}
              style={styles.chevronButton}
            >
              <IconSymbol
                name={isExpanded ? 'chevron.up' : 'chevron.down'}
                size={16}
                color={mutedTextColor}
              />
            </TouchableOpacity>
          )}
        </View>

        {isExpanded && (
          <Animated.View
            layout={LinearTransition.duration(250)}
            style={styles.expandedContent}
          >
            {isMultiUser
              ? activeSession!.users.map((user) => (
                  <UserProgressItem
                    key={user.id}
                    user={user}
                    textColor={textColor}
                    mutedTextColor={mutedTextColor}
                    surfaceColor={surfaceColor}
                  />
                ))
              : isMultiFile
                ? activeSession!.users[0].files.map((file) => (
                    <FileProgressItem
                      key={file.id}
                      file={file}
                      textColor={textColor}
                      mutedTextColor={mutedTextColor}
                      surfaceColor={surfaceColor}
                    />
                  ))
                : null}
          </Animated.View>
        )}

        <View style={styles.footer}>
          <ThemedText style={[styles.sizeInfo, { color: mutedTextColor }]}>
            {formatSize(totalTransferredBytes)} / {formatSize(totalSizeBytes)}
          </ThemedText>
          <TouchableOpacity
            style={[styles.cancelButton, { backgroundColor: textColor }]}
            onPress={cancelSession}
          >
            <ThemedText style={[styles.cancelText, { color: backgroundColor }]}>
              CANCEL
            </ThemedText>
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
}

function UserProgressItem({
  user,
  textColor,
  mutedTextColor,
  surfaceColor,
}: {
  user: UserTransfer;
  textColor: string;
  mutedTextColor: string;
  surfaceColor: string;
}) {
  const userTotalSize = user.files.reduce((acc, f) => acc + f.size, 0);
  const userTransferred = user.files.reduce((acc, f) => acc + f.transferred, 0);
  const progress = userTotalSize > 0 ? userTransferred / userTotalSize : 0;

  return (
    <View style={styles.subItem}>
      <View style={styles.subItemHeader}>
        <ThemedText style={styles.subItemTitle}>{user.deviceName}</ThemedText>
        <ThemedText style={styles.subItemPercentage}>
          {Math.round(progress * 100)}%
        </ThemedText>
      </View>
      <View
        style={[
          styles.subProgressBarContainer,
          { backgroundColor: surfaceColor },
        ]}
      >
        <View
          style={[
            styles.subProgressBar,
            { width: `${progress * 100}%`, backgroundColor: textColor },
          ]}
        />
      </View>
      <ThemedText style={[styles.subItemSize, { color: mutedTextColor }]}>
        {formatSize(userTransferred)} / {formatSize(userTotalSize)}
      </ThemedText>
    </View>
  );
}

function FileProgressItem({
  file,
  textColor,
  mutedTextColor,
  surfaceColor,
}: {
  file: FileTransfer;
  textColor: string;
  mutedTextColor: string;
  surfaceColor: string;
}) {
  const progress = file.size > 0 ? file.transferred / file.size : 0;

  return (
    <View style={styles.subItem}>
      <View style={styles.subItemHeader}>
        <ThemedText style={styles.subItemTitle}>{file.name}</ThemedText>
        <ThemedText style={styles.subItemPercentage}>
          {Math.round(progress * 100)}%
        </ThemedText>
      </View>
      <View
        style={[
          styles.subProgressBarContainer,
          { backgroundColor: surfaceColor },
        ]}
      >
        <View
          style={[
            styles.subProgressBar,
            { width: `${progress * 100}%`, backgroundColor: textColor },
          ]}
        />
      </View>
      <ThemedText style={[styles.subItemSize, { color: mutedTextColor }]}>
        {formatSize(file.transferred)} / {formatSize(file.size)}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 20,
    right: 20,
    borderRadius: 20,
    borderWidth: 1,
    zIndex: 1000,
    overflow: 'hidden',
  },
  shadow: {
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 8,
  },
  content: {
    padding: 18,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  titleContainer: {
    flex: 1,
  },
  title: {
    fontFamily: Fonts.sans.bold,
    fontSize: 16,
  },
  subtitle: {
    fontFamily: Fonts.sans.medium,
    fontSize: 11,
    textTransform: 'uppercase',
    // marginTop: 2,
  },
  percentage: {
    fontFamily: Fonts.sans.bold,
    fontSize: 20,
    marginLeft: 10,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  progressBarContainer: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
  },
  chevronButton: {
    padding: 4,
    marginLeft: 8,
  },
  expandedContent: {
    marginBottom: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
    paddingTop: 12,
  },
  subItem: {
    marginBottom: 12,
  },
  subItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  subItemTitle: {
    fontSize: 14,
    fontFamily: Fonts.sans.medium,
  },
  subItemPercentage: {
    fontSize: 14,
    fontFamily: Fonts.sans.bold,
  },
  subItemSize: {
    fontSize: 11,
    fontFamily: Fonts.sans.medium,
    marginTop: 4,
  },
  subProgressBarContainer: {
    height: 3,
    borderRadius: 1.5,
    overflow: 'hidden',
  },
  subProgressBar: {
    height: '100%',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sizeInfo: {
    fontFamily: Fonts.sans.bold,
    fontSize: 13,
  },
  cancelButton: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
  },
  cancelText: {
    fontFamily: Fonts.sans.bold,
    fontSize: 10,
  },
  requestFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 4,
  },
  actionButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    minWidth: 90,
    alignItems: 'center',
  },
  actionButtonText: {
    fontFamily: Fonts.sans.bold,
    fontSize: 11,
  },
});
