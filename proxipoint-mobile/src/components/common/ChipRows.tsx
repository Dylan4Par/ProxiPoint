import React, { forwardRef, useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { splitIntoRows } from '../../lib/chipRows';

/**
 * Chips in up to `rows` rows (3 by default) that scroll sideways together. Used on Profile for
 * Followed Tags and My Channels. Rows come out about the same length (lib/chipRows); the first
 * items sit at the left, top to bottom.
 */
export type ChipRowsProps<T> = {
  items: T[];
  keyOf: (item: T) => string;
  /** Rough width of an item's chip, for balancing the rows (lib/chipRows: chipWidth). */
  widthOf: (item: T) => number;
  renderItem: (item: T) => React.ReactElement;
  rows?: number;
  gap?: number;
  testID?: string;
};

function ChipRowsInner<T>(
  { items, keyOf, widthOf, renderItem, rows = 3, gap = 8, testID }: ChipRowsProps<T>,
  ref: React.ForwardedRef<ScrollView>,
) {
  const lines = useMemo(() => splitIntoRows(items, rows, widthOf, gap), [items, rows, widthOf, gap]);
  return (
    <ScrollView
      ref={ref}
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[styles.content, { gap }]}
      testID={testID}
    >
      {lines.map((line, i) => (
        <View key={i} style={[styles.row, { gap }]}>
          {line.map((item) => (
            <React.Fragment key={keyOf(item)}>{renderItem(item)}</React.Fragment>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

export const ChipRows = forwardRef(ChipRowsInner) as <T>(
  props: ChipRowsProps<T> & { ref?: React.Ref<ScrollView> },
) => React.ReactElement;

const styles = StyleSheet.create({
  content: { flexDirection: 'column', paddingRight: 4 },
  row: { flexDirection: 'row' },
});
