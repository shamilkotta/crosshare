import * as React from 'react';

import { CrossshareLanViewProps } from './CrossshareLan.types';

export default function CrossshareLanView(props: CrossshareLanViewProps) {
  return (
    <div>
      <iframe
        style={{ flex: 1 }}
        src={props.url}
        onLoad={() => props.onLoad({ nativeEvent: { url: props.url } })}
      />
    </div>
  );
}
