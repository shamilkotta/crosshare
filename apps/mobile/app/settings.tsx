import Crosshare from '@crosshare/core';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  DeviceIcon,
  Group,
  Icon,
  IconButton,
  Row,
  Section,
  Txt,
  useColors,
} from '@/components/ui';
import { Fonts } from '@/constants/theme';
import { useCrosshare } from '@/context/crosshare-context';
import { useTheme } from '@/context/theme-context';

export default function Settings() {
  const router = useRouter();
  const c = useColors();
  const { device, rename, visible, setVisible, links, unlink, history, clearHistory } =
    useCrosshare();
  const { themeMode, setThemeMode } = useTheme();
  const [name, setName] = useState(device.name);
  const wifiAware = useMemo(() => Crosshare.isWifiAwareSupported(), []);

  const saveName = () => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== device.name) rename(trimmed);
    else setName(device.name);
  };

  const pair = async (mode: 'show' | 'find') => {
    try {
      await Crosshare.pairWifiAware(mode);
    } catch (e: any) {
      Alert.alert('Pairing failed', e?.message ?? String(e));
    }
  };

  const confirmUnlink = (id: string, deviceName: string) =>
    Alert.alert(`Unlink ${deviceName}?`, 'It’s removed on both devices.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Unlink', style: 'destructive', onPress: () => unlink(id) },
    ]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }} edges={['top']}>
      <View style={styles.topBar}>
        <IconButton icon="arrow-left" label="Back" tone="primary" onPress={() => router.back()} />
        <Txt variant="heading">Settings</Txt>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Section title="This device">
          <Group>
            <Row>
              <Txt tone="secondary" style={styles.label}>
                Name
              </Txt>
              <TextInput
                value={name}
                onChangeText={setName}
                onBlur={saveName}
                onSubmitEditing={saveName}
                returnKeyType="done"
                style={[styles.input, { color: c.text }]}
              />
              <Icon name="edit-2" size={14} tone="tertiary" />
            </Row>
            <Row>
              <View style={{ flex: 1, gap: 2 }}>
                <Txt>Visible</Txt>
                <Txt variant="small" tone="secondary">
                  Nearby devices can find you and send you things.
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
          </Group>
        </Section>

        <Section title="Linked devices">
          <Group>
            {links.map((l) => (
              <Row key={l.id}>
                <DeviceIcon platform={l.platform} size={32} />
                <Txt variant="medium" numberOfLines={1} style={{ flex: 1 }}>
                  {l.name}
                </Txt>
                <Txt
                  variant="label"
                  tone="secondary"
                  onPress={() => confirmUnlink(l.id, l.name)}
                  suppressHighlighting
                >
                  Unlink
                </Txt>
              </Row>
            ))}
            <Row>
              <Txt variant="small" tone="secondary" style={{ flex: 1 }}>
                {links.length === 0
                  ? 'No linked devices. Tap a nearby device on the home screen, then Link device. '
                  : ''}
                Text sent between linked devices goes straight to the clipboard. Files still ask
                first.
              </Txt>
            </Row>
          </Group>
        </Section>

        {wifiAware && (
          <Section title="Wi-Fi Aware">
            <Group>
              <Row onPress={() => pair('show')}>
                <Icon name="eye" tone="secondary" />
                <Txt style={{ flex: 1 }}>Show pairing code</Txt>
                <Icon name="chevron-right" tone="tertiary" />
              </Row>
              <Row onPress={() => pair('find')}>
                <Icon name="hash" tone="secondary" />
                <Txt style={{ flex: 1 }}>Enter a code from another iPhone</Txt>
                <Icon name="chevron-right" tone="tertiary" />
              </Row>
            </Group>
          </Section>
        )}

        <Section title="Appearance">
          <View style={[styles.segment, { borderColor: c.border, backgroundColor: c.surface }]}>
            {(['system', 'light', 'dark'] as const).map((m) => {
              const on = themeMode === m;
              return (
                <Txt
                  key={m}
                  variant="medium"
                  tone={on ? 'primary' : 'secondary'}
                  onPress={() => setThemeMode(m)}
                  suppressHighlighting
                  style={[
                    styles.segmentItem,
                    on && { backgroundColor: c.background, borderColor: c.borderStrong },
                  ]}
                >
                  {m[0].toUpperCase() + m.slice(1)}
                </Txt>
              );
            })}
          </View>
        </Section>

        {history.length > 0 && (
          <Group>
            <Row
              onPress={() =>
                Alert.alert('Clear activity?', 'Received files stay on your device.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Clear', style: 'destructive', onPress: clearHistory },
                ])
              }
            >
              <Icon name="trash-2" tone="secondary" />
              <Txt style={{ flex: 1 }}>Clear activity</Txt>
            </Row>
          </Group>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  content: { padding: 16, paddingBottom: 48, gap: 28 },
  label: { width: 56 },
  input: {
    flex: 1,
    fontFamily: Fonts.sans.medium,
    fontSize: 15,
    paddingVertical: 0,
  },
  segment: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  segmentItem: {
    flex: 1,
    textAlign: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: 'transparent',
    overflow: 'hidden',
  },
});
