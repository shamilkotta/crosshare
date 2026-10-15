// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SymbolWeight, SymbolViewProps } from 'expo-symbols';
import { ComponentProps } from 'react';
import { OpaqueColorValue, type StyleProp, type TextStyle } from 'react-native';

type IconMapping = Partial<
  Record<SymbolViewProps['name'], ComponentProps<typeof MaterialIcons>['name']>
>;
type IconSymbolName = keyof typeof MAPPING;

/**
 * Add your SF Symbols to Material Icons mappings here.
 * - see Material Icons in the [Icons Directory](https://icons.expo.fyi).
 * - see SF Symbols in the [SF Symbols](https://developer.apple.com/sf-symbols/) app.
 */
const MAPPING = {
  'house.fill': 'home',
  'paperplane.fill': 'send',
  'chevron.left.forwardslash.chevron.right': 'code',
  'chevron.right': 'chevron-right',
  plus: 'add',
  xmark: 'close',
  gearshape: 'settings',
  'person.crop.circle': 'account-circle',
  'person.fill': 'person',
  'antenna.radiowaves.left.and.right': 'wifi-tethering',
  laptopcomputer: 'laptop',
  'arrow.left': 'arrow-back',
  'doc.fill': 'description',
  'photo.fill': 'image',
  'archive.fill': 'folder-zip',
  'video.fill': 'videocam',
  'music.note': 'audiotrack',
  'checkmark.circle.fill': 'check-circle',
  'xmark.circle.fill': 'cancel',
  'text.alignleft': 'notes',
  'doc.on.doc': 'file-copy',
  'tray.and.arrow.down.fill': 'download',
  'chevron.up': 'expand-less',
  'chevron.down': 'expand-more',
  'arrow.up.circle': 'upload',
  'arrow.down.circle': 'download',
  desktopcomputer: 'computer',
  iphone: 'smartphone',
  wifi: 'wifi',
  'dot.radiowaves.left.and.right': 'bluetooth',
  pencil: 'edit',
  trash: 'delete-outline',
  'square.and.arrow.up': 'open-in-new',
} as IconMapping;

/**
 * An icon component that uses native SF Symbols on iOS, and Material Icons on Android and web.
 * This ensures a consistent look across platforms, and optimal resource usage.
 * Icon `name`s are based on SF Symbols and require manual mapping to Material Icons.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  return (
    <MaterialIcons
      color={color}
      size={size}
      name={MAPPING[name]}
      style={style}
    />
  );
}
