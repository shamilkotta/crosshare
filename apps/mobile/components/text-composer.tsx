import * as Clipboard from 'expo-clipboard';
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Fonts, Radius } from '@/constants/theme';
import { Button, Txt, useColors } from './ui';

/** Multiline text field with Paste, used inside sheets. */
export function TextComposer({
  action,
  onSubmit,
  onCancel,
}: {
  /** Label of the submit button, e.g. "Send to Pixel 8". */
  action: string;
  onSubmit: (text: string) => void;
  onCancel: () => void;
}) {
  const c = useColors();
  const [text, setText] = useState('');
  const [hasClipboard, setHasClipboard] = useState(false);
  const input = useRef<TextInput>(null);

  useEffect(() => {
    // Wait for the sheet to appear before raising the keyboard.
    const timer = setTimeout(() => input.current?.focus(), 250);
    Clipboard.hasStringAsync().then(setHasClipboard).catch(() => {});
    return () => clearTimeout(timer);
  }, []);

  const trimmed = text.trim();
  return (
    <View style={{ gap: 12 }}>
      <View style={styles.header}>
        <Txt variant="heading">Text or link</Txt>
        {hasClipboard && (
          <Button
            title="Paste"
            icon="clipboard"
            variant="ghost"
            style={{ height: 32, paddingHorizontal: 8 }}
            onPress={async () => setText(await Clipboard.getStringAsync())}
          />
        )}
      </View>
      <TextInput
        ref={input}
        multiline
        value={text}
        onChangeText={setText}
        placeholder="Type or paste something…"
        placeholderTextColor={c.tertiary}
        style={[
          styles.input,
          { color: c.text, borderColor: c.borderStrong, backgroundColor: c.surface },
        ]}
      />
      <View style={styles.actions}>
        <Button title="Cancel" onPress={onCancel} style={{ flex: 1 }} />
        <Button
          title={action}
          variant="primary"
          disabled={!trimmed}
          onPress={() => onSubmit(trimmed)}
          style={{ flex: 2 }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 32,
  },
  input: {
    minHeight: 120,
    maxHeight: 240,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: Radius.md,
    padding: 12,
    fontFamily: Fonts.sans.regular,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  actions: { flexDirection: 'row', gap: 8 },
});
