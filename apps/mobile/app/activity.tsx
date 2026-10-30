import { useRouter } from 'expo-router';
import React from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HistoryRow } from '@/components/activity-row';
import { IconButton, Txt, useColors } from '@/components/ui';
import { useCrosshare } from '@/context/crosshare-context';

export default function Activity() {
  const router = useRouter();
  const c = useColors();
  const { history, clearHistory } = useCrosshare();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }} edges={['top']}>
      <View style={styles.topBar}>
        <IconButton icon="arrow-left" label="Back" tone="primary" onPress={() => router.back()} />
        <Txt variant="heading">Activity</Txt>
        {history.length > 0 ? (
          <IconButton
            icon="trash-2"
            label="Clear activity"
            onPress={() =>
              Alert.alert('Clear activity?', 'Received files stay on your device.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Clear', style: 'destructive', onPress: clearHistory },
              ])
            }
          />
        ) : (
          <View style={{ width: 36 }} />
        )}
      </View>
      <FlatList
        data={history}
        keyExtractor={(h) => h.id}
        renderItem={({ item }) => <HistoryRow entry={item} />}
        ItemSeparatorComponent={() => (
          <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.border, marginLeft: 44 }} />
        )}
        contentContainerStyle={{ paddingBottom: 48 }}
        ListEmptyComponent={
          <Txt variant="small" tone="secondary" style={styles.empty}>
            Things you send and receive show up here.
          </Txt>
        }
      />
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
  empty: { textAlign: 'center', marginTop: 64 },
});
