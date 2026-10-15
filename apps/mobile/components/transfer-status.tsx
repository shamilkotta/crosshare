import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, TouchableOpacity } from 'react-native';
import Animated, {
  FadeInUp,
  FadeOutUp,
  LinearTransition,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import Crossshare, { Transfer, isFinalStatus } from '@crossshare/core';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import { Fonts } from '@/constants/theme';
import { formatSize, useCrossshare } from '@/context/crossshare-context';

const transportLabel = (t: Transfer) =>
  t.transport === 'aware'
    ? 'WI-FI AWARE'
    : t.transport === 'hotspot'
      ? 'DIRECT WI-FI'
      : t.transport === 'bluetooth'
        ? 'BLUETOOTH'
        : 'WI-FI';

function statusLabel(t: Transfer) {
  switch (t.status) {
    case 'connecting':
      return `CONNECTING TO ${t.peerName.toUpperCase()}`;
    case 'waiting':
      return `WAITING FOR ${t.peerName.toUpperCase()}`;
    case 'upgrading':
      return 'SWITCHING TO DIRECT WI-FI';
    default:
      return `${t.direction === 'outgoing' ? 'TO' : 'FROM'} ${t.peerName.toUpperCase()} · ${transportLabel(t)}`;
  }
}

function resultTitle(t: Transfer) {
  const what =
    t.files.length === 0
      ? 'Text'
      : t.files.length === 1
        ? t.files[0].name
        : `${t.files.length} files`;
  switch (t.status) {
    case 'completed':
      return t.direction === 'incoming' ? `Received ${what}` : `Sent ${what}`;
    case 'declined':
      return t.direction === 'incoming' ? 'Declined' : `${t.peerName} declined`;
    case 'cancelled':
      return 'Transfer cancelled';
    default:
      return 'Transfer failed';
  }
}

export function TransferStatus() {
  const { transfers, requests, respond, cancel, dismiss } = useCrossshare();
  const [isExpanded, setIsExpanded] = useState(false);
  const insets = useSafeAreaInsets();
  const scheduled = useRef(new Set<string>());

  const backgroundColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');
  const mutedTextColor = useThemeColor({}, 'mutedText');
  const surfaceColor = useThemeColor({}, 'surface');
  const borderColor = useThemeColor({}, 'border');

  const active = transfers.filter(
    (t) =>
      !isFinalStatus(t.status) &&
      !(t.direction === 'incoming' && t.status === 'waiting')
  );
  const finished = transfers.filter((t) => isFinalStatus(t.status));

  // Finished transfers fade out on their own; received files stay a little longer.
  useEffect(() => {
    for (const t of finished) {
      if (scheduled.current.has(t.id)) continue;
      scheduled.current.add(t.id);
      const keep =
        t.direction === 'incoming' && t.status === 'completed' ? 15000 : 4000;
      setTimeout(() => dismiss(t.id), keep);
    }
  }, [finished, dismiss]);

  const request = requests[0];
  const containerStyle = [
    styles.container,
    { top: insets.top + 10, backgroundColor, borderColor },
    styles.shadow,
  ];

  if (request) {
    const size = request.files.reduce((acc, f) => acc + f.size, 0);
    return (
      <Animated.View
        entering={FadeInUp.duration(250)}
        exiting={FadeOutUp.duration(200)}
        layout={LinearTransition.duration(250)}
        style={containerStyle}
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
                {request.peerName} wants to share
              </ThemedText>
              <ThemedText
                style={[styles.subtitle, { color: mutedTextColor }]}
                numberOfLines={2}
              >
                {request.files.length > 0
                  ? `${request.files.length} ${request.files.length === 1 ? 'file' : 'files'} • ${formatSize(size)}`
                  : request.text}
              </ThemedText>
            </View>
          </View>

          <View style={styles.requestFooter}>
            <TouchableOpacity
              style={[styles.actionButton, { borderColor, borderWidth: 1 }]}
              onPress={() => respond(request.id, false)}
            >
              <ThemedText
                style={[styles.actionButtonText, { color: textColor }]}
              >
                DECLINE
              </ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: textColor }]}
              onPress={() => respond(request.id, true)}
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

  if (active.length === 0) {
    const last = finished[0];
    if (!last) return null;
    const received =
      last.direction === 'incoming' && last.status === 'completed';
    const firstUri = last.files.find((f) => f.uri)?.uri;
    return (
      <Animated.View
        entering={FadeInUp.duration(250)}
        exiting={FadeOutUp.duration(200)}
        layout={LinearTransition.duration(250)}
        style={containerStyle}
      >
        <View style={styles.content}>
          <View style={styles.header}>
            <View
              style={[styles.iconContainer, { backgroundColor: surfaceColor }]}
            >
              <IconSymbol
                name={
                  last.status === 'completed'
                    ? 'checkmark.circle.fill'
                    : 'xmark.circle.fill'
                }
                size={18}
                color={textColor}
              />
            </View>
            <View style={styles.titleContainer}>
              <ThemedText style={styles.title} numberOfLines={1}>
                {resultTitle(last)}
              </ThemedText>
              <ThemedText
                style={[styles.subtitle, { color: mutedTextColor }]}
                numberOfLines={2}
              >
                {last.status === 'failed' && last.error
                  ? last.error
                  : last.text && received
                    ? last.text
                    : last.peerName}
              </ThemedText>
            </View>
          </View>
          <View style={styles.requestFooter}>
            {received && last.text ? (
              <TouchableOpacity
                style={[styles.actionButton, { borderColor, borderWidth: 1 }]}
                onPress={() => Clipboard.setStringAsync(last.text!)}
              >
                <ThemedText
                  style={[styles.actionButtonText, { color: textColor }]}
                >
                  COPY
                </ThemedText>
              </TouchableOpacity>
            ) : null}
            {received && firstUri ? (
              <TouchableOpacity
                style={[styles.actionButton, { borderColor, borderWidth: 1 }]}
                onPress={() => Crossshare.openFile(firstUri)}
              >
                <ThemedText
                  style={[styles.actionButtonText, { color: textColor }]}
                >
                  OPEN
                </ThemedText>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: textColor }]}
              onPress={() => dismiss(last.id)}
            >
              <ThemedText
                style={[styles.actionButtonText, { color: backgroundColor }]}
              >
                DONE
              </ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    );
  }

  const totalSize = active.reduce((acc, t) => acc + t.totalBytes, 0);
  const totalDone = active.reduce((acc, t) => acc + t.transferredBytes, 0);
  const percentage =
    totalSize > 0 ? Math.round((totalDone / totalSize) * 100) : 0;
  const single = active[0];
  const isMulti = active.length > 1;
  const isMultiFile = !isMulti && single.files.length > 1;
  const showChevron = isMulti || isMultiFile;

  const title = isMulti
    ? `Sharing with ${active.length} devices`
    : single.files.length === 0
      ? 'Text'
      : isMultiFile
        ? `${single.files.length} files`
        : single.files[0].name;
  const subtitle = isMulti
    ? `${active.reduce((a, t) => a + t.files.length, 0)} files total`
    : statusLabel(single);

  return (
    <Animated.View
      entering={FadeInUp.duration(250)}
      exiting={FadeOutUp.duration(200)}
      layout={LinearTransition.duration(250)}
      style={containerStyle}
    >
      <View style={styles.content}>
        <View style={styles.header}>
          <View
            style={[styles.iconContainer, { backgroundColor: surfaceColor }]}
          >
            <IconSymbol
              name={
                single.direction === 'incoming'
                  ? 'arrow.down.circle'
                  : isMulti || isMultiFile
                    ? 'doc.on.doc'
                    : 'doc.fill'
              }
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

        {isExpanded && showChevron && (
          <Animated.View
            layout={LinearTransition.duration(250)}
            style={styles.expandedContent}
          >
            {isMulti
              ? active.map((t) => (
                  <ProgressItem
                    key={t.id}
                    title={t.peerName}
                    caption={statusLabel(t)}
                    done={t.transferredBytes}
                    size={t.totalBytes}
                    textColor={textColor}
                    mutedTextColor={mutedTextColor}
                    surfaceColor={surfaceColor}
                  />
                ))
              : single.files.map((f, i) => (
                  <ProgressItem
                    key={i}
                    title={f.name}
                    done={f.transferred}
                    size={f.size}
                    textColor={textColor}
                    mutedTextColor={mutedTextColor}
                    surfaceColor={surfaceColor}
                  />
                ))}
          </Animated.View>
        )}

        <View style={styles.footer}>
          <ThemedText style={[styles.sizeInfo, { color: mutedTextColor }]}>
            {formatSize(totalDone)} / {formatSize(totalSize)}
          </ThemedText>
          <TouchableOpacity
            style={[styles.cancelButton, { backgroundColor: textColor }]}
            onPress={() => active.forEach((t) => cancel(t.id))}
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

function ProgressItem({
  title,
  caption,
  done,
  size,
  textColor,
  mutedTextColor,
  surfaceColor,
}: {
  title: string;
  caption?: string;
  done: number;
  size: number;
  textColor: string;
  mutedTextColor: string;
  surfaceColor: string;
}) {
  const progress = size > 0 ? done / size : 0;
  return (
    <View style={styles.subItem}>
      <View style={styles.subItemHeader}>
        <ThemedText style={styles.subItemTitle} numberOfLines={1}>
          {title}
        </ThemedText>
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
        {caption ? `${caption} · ` : ''}
        {formatSize(done)} / {formatSize(size)}
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
