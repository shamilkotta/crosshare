import { NativeModule, requireNativeModule } from 'expo';

import { CrossshareLanModuleEvents } from './CrossshareLan.types';

declare class CrossshareLanModule extends NativeModule<CrossshareLanModuleEvents> {
  PI: number;
  hello(): string;
  setValueAsync(value: string): Promise<void>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<CrossshareLanModule>('CrossshareLan');
