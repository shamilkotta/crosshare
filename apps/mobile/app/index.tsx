import { useFocusEffect, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { isFinalStatus } from '@crosshare/core';

import { HistoryRow, LiveTransferRow } from '@/components/activity-row';
import { DeviceSheet, routeLabel, Tile } from '@/components/device-sheet';
import { TextComposer } from '@/components/text-composer';
import {
  DeviceIcon,
  Group,
  Icon,
  IconButton,
  Row,
  Section,
  Sheet,
  Tag,
  Txt,
  tap,
  useColors,
} from '@/components/ui';
import { Device, Selection, useCrosshare } from '@/context/crosshare-context';
import { useIncomingShare } from '@/hooks/use-incoming-share';
import {
  clipboardSelection,
  describeSelection,
  pickFiles,
  pickMedia,
} from '@/lib/send';

export default function Home() {
  useIncomingShare();
  const router = useRouter();
  const c = useColors();
  const {
    device,
    devices,
    bluetooth,
    visible,
    setVisible,
    setDiscovering,
    selection,
    setSelection,
    send,
    transfers,
    requests,
    history,
  } = useCrosshare();
  const [sheetDevice, setSheetDevice] = useState<Device | null>(null);
  const [composing, setComposing] = useState(false);
  /** Devices the current selection was sent to. It stays selected for sending to more. */
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());

  useEffect(() => setSentTo(new Set()), [selection]);

  useFocusEffect(
    useCallback(() => {
      setDiscovering(true);
      return () => setDiscovering(false);
    }, [setDiscovering])
  );

  const choose = async (pick: () => Promise<Selection | null>) => {
    const s = await pick();
    if (s) setSelection(s);
  };

  const onDevice = async (d: Device) => {
    tap();
    if (!selection || !d.peer) {
      setSheetDevice(d);
      return;
    }
    try {
      await send(d.peer.id, selection);
      setSentTo((prev) => new Set(prev).add(d.id));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert(`Couldn't send to ${d.name}`, e?.message ?? String(e));
    }
  };

  const live = transfers.filter(
    (t) => !isFinalStatus(t.status) && !requests.includes(t)
  );
  const recent = history.slice(0, 5);
  const bluetoothIssue =
    bluetooth === 'off'
      ? 'Bluetooth is off. Turn it on to find devices that aren’t on your Wi-Fi.'
      : bluetooth === 'unauthorized'
        ? 'Crosshare can’t use Bluetooth. Allow it in Settings to find more devices.'
        : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }} edges={['top']}>
      <View style={styles.topBar}>
        <Txt variant="title">Crosshare</Txt>
        <IconButton
          icon="settings"
          label="Settings"
          onPress={() => router.push('/settings')}
        />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* This device */}
        <Group>
          <Row onPress={() => setVisible(!visible)}>
            <DeviceIcon platform={device.platform} dim={!visible} />
            <View style={{ flex: 1, gap: 2 }}>
              <Txt variant="medium" numberOfLines={1}>
                {device.name}
              </Txt>
              <Txt variant="small" tone="secondary">
                {visible ? 'Visible to nearby devices' : 'Hidden. No one can send to you'}
              </Txt>
            </View>
            <Switch
              value={visible}
              onValueChange={setVisible}
              trackColor={{ false: c.borderStrong, true: c.inverse }}
              thumbColor={c.background}
              ios_backgroundColor={c.borderStrong}
            />
          </Row>
          {bluetoothIssue && (
            <Row>
              <Icon name="bluetooth" tone="secondary" />
              <Txt variant="small" tone="secondary" style={{ flex: 1 }}>
                {bluetoothIssue}
              </Txt>
            </Row>
          )}
        </Group>

        {/* What to send */}
        <Section
          title="Send"
          right={
            selection && (
              <Pressable hitSlop={8} onPress={() => setSelection(null)}>
                <Txt variant="label" tone={sentTo.size ? 'primary' : 'secondary'}>
                  {sentTo.size ? 'Done' : 'Clear'}
                </Txt>
              </Pressable>
            )
          }
        >
          {selection ? (
            <SelectionCard selection={selection} sentCount={sentTo.size} />
          ) : (
            <View style={styles.tiles}>
              <Tile icon="image" label="Photos" onPress={() => choose(pickMedia)} />
              <Tile icon="file" label="Files" onPress={() => choose(pickFiles)} />
              <Tile icon="type" label="Text" onPress={() => setComposing(true)} />
              <Tile
                icon="clipboard"
                label="Paste"
                onPress={() =>
                  choose(async () => {
                    const s = await clipboardSelection();
                    if (!s) Alert.alert('Clipboard is empty');
                    return s;
                  })
                }
              />
            </View>
          )}
        </Section>

        {/* Devices */}
        <Section
          title={
            !selection ? 'Devices' : sentTo.size ? 'Send to another device' : 'Choose a device'
          }
          right={
            <View style={styles.searching}>
              <ActivityIndicator size="small" color={c.tertiary} />
              <Txt variant="label" tone="tertiary">
                Searching
              </Txt>
            </View>
          }
        >
          {devices.length === 0 ? (
            <View style={[styles.empty, { borderColor: c.border }]}>
              <Txt variant="medium">No devices nearby</Txt>
              <Txt variant="small" tone="secondary" style={{ textAlign: 'center' }}>
                Open Crosshare on the other device and make sure it’s visible.
              </Txt>
            </View>
          ) : (
            <Group>
              {devices.map((d) => (
                <DeviceRow
                  key={d.id}
                  device={d}
                  ready={!!selection}
                  sent={sentTo.has(d.id)}
                  onPress={() => onDevice(d)}
                  onLongPress={() => setSheetDevice(d)}
                />
              ))}
            </Group>
          )}
        </Section>

        {/* Activity */}
        <Section
          title="Activity"
          right={
            history.length > recent.length && (
              <Pressable hitSlop={8} onPress={() => router.push('/activity')}>
                <Txt variant="label" tone="secondary">
                  See all
                </Txt>
              </Pressable>
            )
          }
        >
          {live.length + recent.length === 0 ? (
            <View style={[styles.empty, { borderColor: c.border }]}>
              <Txt variant="small" tone="secondary">
                Things you send and receive show up here.
              </Txt>
            </View>
          ) : (
            <Group>
              {live.map((t) => (
                <LiveTransferRow key={t.id} transfer={t} />
              ))}
              {recent.map((h) => (
                <HistoryRow key={h.id} entry={h} />
              ))}
            </Group>
          )}
        </Section>
      </ScrollView>

      <DeviceSheet device={sheetDevice} onClose={() => setSheetDevice(null)} />
      <Sheet visible={composing} onClose={() => setComposing(false)}>
        <TextComposer
          action="Choose device"
          onCancel={() => setComposing(false)}
          onSubmit={(text) => {
            setComposing(false);
            setSelection({ files: [], text });
          }}
        />
      </Sheet>
    </SafeAreaView>
  );
}

function SelectionCard({
  selection,
  sentCount,
}: {
  selection: Selection;
  sentCount: number;
}) {
  const c = useColors();
  const { title, detail } = describeSelection(selection);
  const isText = selection.files.length === 0;
  return (
    <View style={[styles.selection, { borderColor: c.text, backgroundColor: c.surface }]}>
      <Icon name={isText ? 'type' : selection.files.length > 1 ? 'layers' : 'file'} />
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="medium" numberOfLines={1}>
          {title}
        </Txt>
        <Txt variant="small" tone="secondary" numberOfLines={2}>
          {sentCount
            ? `Sent to ${sentCount} device${sentCount > 1 ? 's' : ''}. Tap another to send again.`
            : detail}
        </Txt>
      </View>
    </View>
  );
}

function DeviceRow({
  device: d,
  ready,
  sent,
  onPress,
  onLongPress,
}: {
  device: Device;
  ready: boolean;
  sent: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const c = useColors();
  const nearby = !!d.peer;
  return (
    <Row onPress={onPress} onLongPress={onLongPress}>
      <DeviceIcon platform={d.platform} dim={!nearby} />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={styles.nameRow}>
          <Txt
            variant="medium"
            numberOfLines={1}
            tone={nearby ? 'primary' : 'secondary'}
            style={{ flexShrink: 1 }}
          >
            {d.name}
          </Txt>
          {d.linked && <Tag label="Linked" />}
        </View>
        <Txt variant="small" tone="secondary">
          {d.peer ? routeLabel(d.peer.routes) : 'Not nearby'}
        </Txt>
      </View>
      {ready && nearby && sent ? (
        <View style={[styles.sendPill, styles.sentPill, { borderColor: c.borderStrong }]}>
          <Icon name="check" size={12} tone="secondary" />
          <Txt variant="label" tone="secondary">
            Sent
          </Txt>
        </View>
      ) : ready && nearby ? (
        <View style={[styles.sendPill, { backgroundColor: c.inverse }]}>
          <Txt variant="label" tone="inverse">
            Send
          </Txt>
        </View>
      ) : (
        <Icon name="chevron-right" tone="tertiary" />
      )}
    </Row>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
  },
  content: { padding: 16, paddingBottom: 48, gap: 28 },
  tiles: { flexDirection: 'row', gap: 8 },
  selection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  searching: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  empty: {
    alignItems: 'center',
    gap: 4,
    paddingVertical: 24,
    paddingHorizontal: 16,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderStyle: 'dashed',
    borderRadius: 14,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sendPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  sentPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
});
