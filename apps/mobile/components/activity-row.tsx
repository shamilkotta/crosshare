import * as Clipboard from 'expo-clipboard';
import React from 'react';
import { View } from 'react-native';
import { Transfer } from '@crosshare/core';

import {
  HistoryEntry,
  formatSize,
  openFile,
  useCrosshare,
} from '@/context/crosshare-context';
import { transferCaption, transferTitle } from '@/lib/send';
import { Icon, IconButton, Progress, Row, Txt } from './ui';

const directionIcon = (d: Transfer['direction']) =>
  d === 'incoming' ? 'arrow-down-left' : 'arrow-up-right';

/** A transfer in progress, with a progress bar and a cancel button. */
export function LiveTransferRow({ transfer: t }: { transfer: Transfer }) {
  const { cancel } = useCrosshare();
  const progress = t.totalBytes > 0 ? t.transferredBytes / t.totalBytes : 0;
  const title =
    t.kind === 'link' ? `Linking with ${t.peerName}` : transferTitle(t);
  const caption =
    t.kind === 'link' ? 'Waiting for them to respond…' : transferCaption(t);
  return (
    <Row>
      <Icon name={t.kind === 'link' ? 'link-2' : directionIcon(t.direction)} tone="secondary" />
      <View style={{ flex: 1, gap: 6 }}>
        <View style={{ gap: 2 }}>
          <Txt variant="medium" numberOfLines={1}>
            {title}
          </Txt>
          <Txt variant="small" tone="secondary" numberOfLines={1}>
            {caption}
          </Txt>
        </View>
        {t.status === 'transferring' && t.totalBytes > 0 && (
          <Progress value={progress} />
        )}
      </View>
      <IconButton icon="x" label="Cancel" onPress={() => cancel(t.id)} />
    </Row>
  );
}

/** A finished transfer. Tap opens the file or copies the text. */
export function HistoryRow({ entry: h }: { entry: HistoryEntry }) {
  const uri = h.files.find((f) => f.uri)?.uri;
  const isText = h.files.length === 0;
  const canAct =
    h.status === 'completed' && (isText ? !!h.text : h.direction === 'incoming' && !!uri);
  const onPress = () => {
    if (isText && h.text) Clipboard.setStringAsync(h.text);
    else if (uri) openFile(uri);
  };
  const size = h.files.reduce((n, f) => n + f.size, 0);
  const status =
    h.status === 'completed'
      ? h.direction === 'incoming'
        ? 'Received'
        : 'Sent'
      : h.status[0].toUpperCase() + h.status.slice(1);
  const who = `${h.direction === 'incoming' ? 'From' : 'To'} ${h.peerName}`;
  return (
    <Row onPress={canAct ? onPress : undefined}>
      <Icon name={directionIcon(h.direction)} tone="secondary" />
      <View style={{ flex: 1, gap: 2 }}>
        <Txt
          variant="medium"
          numberOfLines={1}
          tone={h.status === 'completed' ? 'primary' : 'secondary'}
        >
          {transferTitle(h)}
        </Txt>
        <Txt variant="small" tone="secondary" numberOfLines={1}>
          {[who, status, !isText && formatSize(size), timeAgo(h.date)]
            .filter(Boolean)
            .join(' · ')}
        </Txt>
      </View>
      {canAct && (
        <Txt variant="label" tone="secondary">
          {isText ? 'Copy' : 'Open'}
        </Txt>
      )}
    </Row>
  );
}

export function timeAgo(date: number) {
  const s = Math.floor((Date.now() - date) / 1000);
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(date).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}
