import * as Haptics from 'expo-haptics';
import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Device, Selection, useCrosshare } from '@/context/crosshare-context';
import { clipboardSelection, pickFiles, pickMedia } from '@/lib/send';
import { TextComposer } from './text-composer';
import {
  DeviceIcon,
  Group,
  Icon,
  IconName,
  Row,
  Sheet,
  Tag,
  Txt,
  useColors,
} from './ui';

/** Everything you can do with one device: send something to it, link or unlink it. */
export function DeviceSheet({
  device,
  onClose,
}: {
  device: Device | null;
  onClose: () => void;
}) {
  const { send, link, unlink } = useCrosshare();
  const [composing, setComposing] = useState(false);

  useEffect(() => {
    if (!device) setComposing(false);
  }, [device]);

  if (!device) return null;
  const peer = device.peer;

  const deliver = async (pick: () => Promise<Selection | null>) => {
    if (!peer) return;
    const selection = await pick();
    if (!selection) return;
    onClose();
    try {
      await send(peer.id, selection);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert(`Couldn't send to ${device.name}`, e?.message ?? String(e));
    }
  };

  const startLink = async () => {
    if (!peer) return;
    onClose();
    try {
      await link(peer.id);
    } catch (e: any) {
      Alert.alert(`Couldn't link with ${device.name}`, e?.message ?? String(e));
    }
  };

  const confirmUnlink = () =>
    Alert.alert(
      `Unlink ${device.name}?`,
      'Text from this device will ask before it’s copied again. It’s removed on both devices.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unlink',
          style: 'destructive',
          onPress: () => {
            unlink(device.id);
            onClose();
          },
        },
      ]
    );

  return (
    <Sheet visible onClose={onClose}>
      {composing ? (
        <TextComposer
          action={`Send to ${device.name}`}
          onCancel={() => setComposing(false)}
          onSubmit={(text) => deliver(async () => ({ files: [], text }))}
        />
      ) : (
        <>
          <View style={styles.header}>
            <DeviceIcon platform={device.platform} size={44} dim={!peer} />
            <View style={{ flex: 1, gap: 2 }}>
              <View style={styles.titleRow}>
                <Txt variant="heading" numberOfLines={1} style={{ flexShrink: 1 }}>
                  {device.name}
                </Txt>
                {device.linked && <Tag label="Linked" />}
              </View>
              <Txt variant="small" tone="secondary">
                {peer ? routeLabel(peer.routes) : 'Not nearby'}
              </Txt>
            </View>
          </View>

          {peer ? (
            <View style={styles.grid}>
              <Tile icon="image" label="Photos" onPress={() => deliver(pickMedia)} />
              <Tile icon="file" label="Files" onPress={() => deliver(pickFiles)} />
              <Tile icon="type" label="Text" onPress={() => setComposing(true)} />
              <Tile
                icon="clipboard"
                label="Clipboard"
                onPress={() =>
                  deliver(async () => {
                    const s = await clipboardSelection();
                    if (!s) Alert.alert('Clipboard is empty');
                    return s;
                  })
                }
              />
            </View>
          ) : (
            <Txt variant="small" tone="secondary">
              Open Crosshare on {device.name} and keep it close by to send to it.
            </Txt>
          )}

          <Group>
            {device.linked ? (
              <Row onPress={confirmUnlink}>
                <Icon name="link-2" tone="secondary" />
                <Txt style={{ flex: 1 }}>Unlink device</Txt>
              </Row>
            ) : (
              <Row onPress={startLink}>
                <Icon name="link-2" tone="secondary" />
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt>Link device</Txt>
                  <Txt variant="small" tone="secondary">
                    Text you send between linked devices is copied straight away, no prompt.
                  </Txt>
                </View>
              </Row>
            )}
          </Group>
        </>
      )}
    </Sheet>
  );
}

export const routeLabel = (routes: string[]) =>
  routes[0] === 'wifi'
    ? 'Wi-Fi'
    : routes[0] === 'aware'
      ? 'Wi-Fi Aware'
      : 'Bluetooth';

/** Square action button, used for "what to send" choices. */
export function Tile({
  icon,
  label,
  onPress,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
}) {
  const c = useColors();
  return (
    <Row
      onPress={onPress}
      style={[styles.tile, { borderColor: c.border, backgroundColor: c.surface }]}
    >
      <Icon name={icon} size={20} />
      <Txt variant="small">{label}</Txt>
    </Row>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  grid: { flexDirection: 'row', gap: 8 },
  tile: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'center',
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: 12,
    paddingHorizontal: 4,
    minHeight: 76,
  },
});
