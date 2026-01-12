import { registerWebModule, NativeModule } from 'expo';

import { CrossshareLanModuleEvents } from './CrossshareLan.types';

class CrossshareLanModule extends NativeModule<CrossshareLanModuleEvents> {
  PI = Math.PI;
  async setValueAsync(value: string): Promise<void> {
    this.emit('onChange', { value });
  }
  hello() {
    return 'Hello world! 👋';
  }
}

export default registerWebModule(CrossshareLanModule, 'CrossshareLanModule');
