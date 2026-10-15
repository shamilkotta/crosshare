import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Selection } from '@/context/crossshare-context';

type Props = {
  visible: boolean;
  onClose: () => void;
  onPicked: (selection: Selection) => void;
};

/** Lets the user choose what to send: photos/videos, files or a piece of text. */
export function SendSourceSheet({ visible, onClose, onPicked }: Props) {
  const colorScheme = useColorScheme() ?? 'light';
  const themeColors = Colors[colorScheme];
  const [mode, setMode] = useState<'menu' | 'text'>('menu');
  const [text, setText] = useState('');

  const close = () => {
    setMode('menu');
    setText('');
    onClose();
  };

  const pickMedia = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      quality: 1,
      // Send originals (e.g. HEIC) instead of converted copies.
      preferredAssetRepresentationMode:
        ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
    });
    if (result.canceled || result.assets.length === 0) return;
    close();
    onPicked({
      files: result.assets.map((a, i) => ({
        uri: a.uri,
        name: a.fileName ?? a.uri.split('/').pop() ?? `photo-${i}`,
        mimeType: a.mimeType,
        size: a.fileSize,
      })),
    });
  };

  const pickFiles = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (result.canceled || result.assets.length === 0) return;
    close();
    onPicked({
      files: result.assets.map((a) => ({
        uri: a.uri,
        name: a.name,
        mimeType: a.mimeType,
        size: a.size,
      })),
    });
  };

  const sendText = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    close();
    onPicked({ files: [], text: trimmed });
  };

  const Option = ({
    icon,
    label,
    onPress,
  }: {
    icon: any;
    label: string;
    onPress: () => void;
  }) => (
    <TouchableOpacity
      style={[styles.option, { borderColor: themeColors.divider }]}
      onPress={onPress}
    >
      <View
        style={[styles.optionIcon, { backgroundColor: themeColors.surface }]}
      >
        <IconSymbol name={icon} size={20} color={themeColors.text} />
      </View>
      <Text style={[styles.optionLabel, { color: themeColors.text }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={close}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.overlay} onPress={close}>
          <Pressable
            style={[
              styles.sheet,
              {
                backgroundColor: themeColors.background,
                borderColor: themeColors.border,
              },
            ]}
          >
            {mode === 'menu' ? (
              <>
                <Text style={[styles.title, { color: themeColors.text }]}>
                  Send
                </Text>
                <Option
                  icon="photo.fill"
                  label="Photos & Videos"
                  onPress={pickMedia}
                />
                <Option icon="doc.fill" label="Files" onPress={pickFiles} />
                <Option
                  icon="text.alignleft"
                  label="Text or Link"
                  onPress={() => setMode('text')}
                />
              </>
            ) : (
              <>
                <Text style={[styles.title, { color: themeColors.text }]}>
                  Text or Link
                </Text>
                <TextInput
                  value={text}
                  onChangeText={setText}
                  placeholder="Type or paste something"
                  placeholderTextColor={themeColors.mutedText}
                  multiline
                  autoFocus
                  style={[
                    styles.input,
                    {
                      color: themeColors.text,
                      borderColor: themeColors.border,
                      backgroundColor: themeColors.surface,
                    },
                  ]}
                />
                <TouchableOpacity
                  style={[styles.button, { backgroundColor: themeColors.text }]}
                  onPress={sendText}
                >
                  <Text
                    style={[
                      styles.buttonText,
                      { color: themeColors.background },
                    ]}
                  >
                    CHOOSE DEVICE
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    padding: 24,
    paddingBottom: 44,
  },
  title: {
    fontSize: 22,
    fontFamily: Fonts.sans.bold,
    marginBottom: 12,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 14,
  },
  optionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionLabel: {
    fontSize: 16,
    fontFamily: Fonts.sans.medium,
  },
  input: {
    minHeight: 120,
    maxHeight: 240,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    fontSize: 16,
    fontFamily: Fonts.sans.regular,
    textAlignVertical: 'top',
  },
  button: {
    marginTop: 16,
    borderRadius: 24,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 12,
    fontFamily: Fonts.sans.bold,
    letterSpacing: 2,
  },
});
