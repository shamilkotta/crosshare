import * as Haptics from 'expo-haptics';
import React, { useEffect } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { formatSize, useCrosshare } from '@/context/crosshare-context';
import { Radius } from '@/constants/theme';
import { formatCode } from '@/lib/send';
import { Button, DeviceIcon, Icon, Sheet, Txt, useColors } from './ui';

/** Asks about the oldest pending request: an incoming transfer, or a link code to confirm. */
export function RequestSheet() {
  const { requests, respond } = useCrosshare();
  const c = useColors();
  const t = requests[0];
  const id = t?.id;

  useEffect(() => {
    if (id) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  }, [id]);

  if (!t) return null;
  const isLink = t.kind === 'link';
  const answer = (accept: boolean) => respond(t.id, accept);

  return (
    <Sheet visible onClose={() => {}} dismissable={false}>
      <View style={styles.header}>
        <DeviceIcon platform={t.peerPlatform} size={44} />
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="heading" numberOfLines={1}>
            {isLink ? `Link with ${t.peerName}` : t.peerName}
          </Txt>
          <Txt variant="small" tone="secondary">
            {isLink
              ? 'Confirm this code matches on both devices'
              : t.files.length === 0
                ? 'wants to send you text'
                : `wants to send you ${t.files.length === 1 ? 'a file' : `${t.files.length} files`} · ${formatSize(t.totalBytes)}`}
          </Txt>
        </View>
        {requests.length > 1 && (
          <Txt variant="label" tone="tertiary">
            1 of {requests.length}
          </Txt>
        )}
      </View>

      {isLink ? (
        <View style={[styles.codeBox, { borderColor: c.border, backgroundColor: c.surface }]}>
          <Txt variant="code" selectable>
            {formatCode(t.code)}
          </Txt>
          <Txt variant="small" tone="secondary" style={{ textAlign: 'center' }}>
            Only confirm if {t.peerName} shows exactly this code.
          </Txt>
        </View>
      ) : t.files.length === 0 ? (
        <ScrollView
          style={[styles.preview, { borderColor: c.border, backgroundColor: c.surface }]}
          contentContainerStyle={{ padding: 12 }}
        >
          <Txt selectable>{t.text}</Txt>
        </ScrollView>
      ) : (
        <View style={[styles.files, { borderColor: c.border }]}>
          {t.files.slice(0, 4).map((f, i) => (
            <View
              key={i}
              style={[
                styles.file,
                i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
              ]}
            >
              <Icon name="file" size={16} tone="secondary" />
              <Txt numberOfLines={1} style={{ flex: 1 }}>
                {f.name}
              </Txt>
              <Txt variant="small" tone="secondary">
                {formatSize(f.size)}
              </Txt>
            </View>
          ))}
          {t.files.length > 4 && (
            <View style={[styles.file, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }]}>
              <Txt variant="small" tone="secondary">
                and {t.files.length - 4} more
              </Txt>
            </View>
          )}
        </View>
      )}

      <View style={styles.actions}>
        <Button
          title={isLink ? 'Doesn’t match' : 'Decline'}
          onPress={() => answer(false)}
          style={{ flex: 1 }}
        />
        <Button
          title={isLink ? 'Codes match' : 'Accept'}
          variant="primary"
          onPress={() => answer(true)}
          style={{ flex: 1 }}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  codeBox: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 24,
    paddingHorizontal: 16,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: Radius.lg,
  },
  preview: {
    maxHeight: 200,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: Radius.md,
  },
  files: {
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  file: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  actions: { flexDirection: 'row', gap: 8 },
});
