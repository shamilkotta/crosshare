import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Transfer } from '@crosshare/core';

import { formatSize, Selection } from '@/context/crosshare-context';

export async function pickMedia(): Promise<Selection | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images', 'videos'],
    allowsMultipleSelection: true,
    quality: 1,
    // Send originals (e.g. HEIC) instead of converted copies.
    preferredAssetRepresentationMode:
      ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
  });
  if (result.canceled || result.assets.length === 0) return null;
  return {
    files: result.assets.map((a, i) => ({
      uri: a.uri,
      name: a.fileName ?? a.uri.split('/').pop() ?? `photo-${i}`,
      mimeType: a.mimeType,
      size: a.fileSize,
    })),
  };
}

export async function pickFiles(): Promise<Selection | null> {
  const result = await DocumentPicker.getDocumentAsync({
    multiple: true,
    copyToCacheDirectory: true,
  });
  if (result.canceled || result.assets.length === 0) return null;
  return {
    files: result.assets.map((a) => ({
      uri: a.uri,
      name: a.name,
      mimeType: a.mimeType,
      size: a.size,
    })),
  };
}

/** The clipboard's text as a selection, or null when it's empty. */
export async function clipboardSelection(): Promise<Selection | null> {
  const text = (await Clipboard.getStringAsync()).trim();
  return text ? { files: [], text } : null;
}

/** "123456" -> "123 456". */
export const formatCode = (code?: string) =>
  code ? `${code.slice(0, 3)} ${code.slice(3)}` : '';

export function describeSelection(s: Selection) {
  if (s.files.length === 0) return { title: 'Text', detail: s.text ?? '' };
  const size = s.files.reduce((n, f) => n + (f.size ?? 0), 0);
  const title =
    s.files.length === 1 ? s.files[0].name : `${s.files.length} files`;
  const names = s.files
    .slice(0, 3)
    .map((f) => f.name)
    .join(', ');
  const more = s.files.length > 3 ? ` +${s.files.length - 3}` : '';
  return {
    title,
    detail: s.files.length === 1 ? formatSize(size) : `${formatSize(size)} · ${names}${more}`,
  };
}

/** What a transfer carries, in a few words. */
export function transferTitle(t: {
  files: { name: string }[];
  text?: string;
}) {
  if (t.files.length === 0) return t.text?.replace(/\s+/g, ' ') || 'Text';
  return t.files.length === 1 ? t.files[0].name : `${t.files.length} files`;
}

/** Status line under a transfer, e.g. "To Pixel · 42%". */
export function transferCaption(t: Transfer) {
  const who = `${t.direction === 'incoming' ? 'From' : 'To'} ${t.peerName}`;
  const isText = t.files.length === 0;
  switch (t.status) {
    case 'connecting':
      return `${who} · Connecting…`;
    case 'waiting':
      return `${who} · Waiting for them to accept…`;
    case 'upgrading':
      return `${who} · Switching to a faster connection…`;
    case 'transferring':
      return t.totalBytes > 0
        ? `${who} · ${Math.floor((t.transferredBytes / t.totalBytes) * 100)}% of ${formatSize(t.totalBytes)}`
        : `${who} · Sending…`;
    case 'completed':
      if (t.kind === 'link') return `Linked with ${t.peerName}`;
      if (t.direction === 'incoming' && isText) return `${who} · Copied to clipboard`;
      return `${who} · ${t.direction === 'incoming' ? 'Received' : 'Sent'}`;
    case 'declined':
      return `${who} · Declined`;
    case 'cancelled':
      return `${who} · Cancelled`;
    case 'failed':
      return `${who} · Failed${t.error ? `: ${t.error}` : ''}`;
  }
}
