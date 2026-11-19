import React, { useState } from 'react';
import { Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { toDateInputValue, toTimeInputValue } from '../../lib/beaconWindow';

/**
 * Date or time "chip" that opens a real picker: native dialog on Android, a bottom sheet on iOS,
 * and the browser's own picker on web. Shared by the Drop Point and Manage Point sheets.
 */
export function WhenChip({
  kind,
  date,
  minimumDate,
  display,
  onCommit,
  onFocus,
  onBlur,
  testID,
  label,
}: {
  kind: 'date' | 'time';
  /** The Date this chip edits; used to seed the picker. */
  date: Date;
  /** Earliest selectable date (date pickers only). */
  minimumDate?: Date;
  display: string;
  /** Receives 'YYYY-MM-DD' for date chips, 'HH:mm' for time chips. */
  onCommit: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  testID: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [iosDraft, setIosDraft] = useState(date);
  const inputValue = kind === 'date' ? toDateInputValue(date) : toTimeInputValue(date);

  const openPicker = () => {
    onFocus?.();
    setIosDraft(date);
    setOpen(true);
  };

  const closePicker = () => {
    setOpen(false);
    onBlur?.();
  };

  const commitDate = (picked: Date) => {
    onCommit(kind === 'date' ? toDateInputValue(picked) : toTimeInputValue(picked));
  };

  if (Platform.OS === 'web') {
    return (
      <View style={styles.whenChip}>
        <Text style={styles.whenChipText} testID={`${testID}-label`}>
          {display}
        </Text>
        <input
          type={kind}
          value={inputValue}
          min={kind === 'date' && minimumDate ? toDateInputValue(minimumDate) : undefined}
          aria-label={label}
          data-testid={testID}
          onFocus={onFocus}
          onBlur={onBlur}
          // An invisible input only opens its calendar/clock when the tiny native icon is hit.
          // showPicker() opens it from anywhere on the chip.
          onClick={(event) => {
            const input = event.currentTarget as HTMLInputElement & { showPicker?: () => void };
            try {
              input.showPicker?.();
            } catch {
              // showPicker throws if not triggered by a user gesture; the focus fallback still works.
            }
          }}
          onChange={(event) => {
            if (event.currentTarget.value) onCommit(event.currentTarget.value);
          }}
          style={whenInputStyle}
        />
      </View>
    );
  }

  return (
    <>
      <TouchableOpacity
        style={styles.whenChip}
        onPress={openPicker}
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${display}`}
      >
        <Text style={styles.whenChipText} testID={`${testID}-label`}>
          {display}
        </Text>
      </TouchableOpacity>

      {open && Platform.OS === 'android' ? (
        <DateTimePicker
          value={date}
          mode={kind}
          minimumDate={kind === 'date' ? minimumDate : undefined}
          onChange={(event: DateTimePickerEvent, picked?: Date) => {
            closePicker();
            if (event.type === 'set' && picked) commitDate(picked);
          }}
        />
      ) : null}

      {Platform.OS === 'ios' ? (
        <Modal visible={open} transparent animationType="fade" onRequestClose={closePicker}>
          <View style={styles.pickerBackdrop}>
            <View style={styles.pickerSheet}>
              <View style={styles.pickerHeader}>
                <TouchableOpacity onPress={closePicker} accessibilityRole="button">
                  <Text style={styles.pickerCancel}>Cancel</Text>
                </TouchableOpacity>
                <Text style={styles.pickerTitle}>{label}</Text>
                <TouchableOpacity
                  onPress={() => {
                    commitDate(iosDraft);
                    closePicker();
                  }}
                  accessibilityRole="button"
                >
                  <Text style={styles.pickerDone}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={iosDraft}
                mode={kind}
                display={kind === 'date' ? 'inline' : 'spinner'}
                minimumDate={kind === 'date' ? minimumDate : undefined}
                themeVariant="dark"
                onChange={(_event: DateTimePickerEvent, picked?: Date) => {
                  if (picked) setIosDraft(picked);
                }}
              />
            </View>
          </View>
        </Modal>
      ) : null}
    </>
  );
}

const whenInputStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  width: '100%',
  height: '100%',
  opacity: 0,
  cursor: 'pointer',
  border: 'none',
};

const styles = StyleSheet.create({
  whenChip: {
    position: 'relative',
    backgroundColor: '#334155',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    overflow: 'hidden',
  },
  whenChipText: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '600',
  },
  pickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.7)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: '#0f172a',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    borderColor: '#1e293b',
    paddingBottom: 24,
    paddingHorizontal: 12,
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  pickerTitle: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '700',
  },
  pickerCancel: {
    color: '#94a3b8',
    fontSize: 15,
    fontWeight: '600',
  },
  pickerDone: {
    color: '#22d3ee',
    fontSize: 15,
    fontWeight: '800',
  },
});
