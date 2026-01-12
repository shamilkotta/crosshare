import { requireNativeView } from 'expo';
import * as React from 'react';

import { CrossshareLanViewProps } from './CrossshareLan.types';

const NativeView: React.ComponentType<CrossshareLanViewProps> =
  requireNativeView('CrossshareLan');

export default function CrossshareLanView(props: CrossshareLanViewProps) {
  return <NativeView {...props} />;
}
