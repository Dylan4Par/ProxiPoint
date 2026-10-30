import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { RotateCw } from 'lucide-react-native';
import {
  applyDateInput,
  applyTimeInput,
  changeWindowEnd,
  changeWindowStart,
  formatBeaconDate,
  formatBeaconTime,
} from '../../lib/beaconWindow';
import { nextOccurrence, type DroppedPoint } from '../../lib/droppedPoint';
import { WhenChip } from '../discovery/WhenChip';

export interface RenewRequest {
  startsAt: Date;
  endsAt: Date;
  keepInvites: boolean;
}

interface RenewPointCardProps {
  point: DroppedPoint;
  /** Posts the copy. Resolve on success; throw an Error with a readable message on failure. */
  onRenew: (request: RenewRequest) => Promise<void>;
}

/**
 * "Drop again" for an ended Point: every detail is copied, the host only picks new dates.
 * Defaults to the same weekday and time next week.
 */
export const RenewPointCard: React.FC<RenewPointCardProps> = ({ point, onRenew }) => {
  const suggested = nextOccurrence(point);
  const [startsAt, setStartsAt] = useState(suggested.startsAt);
  const [endsAt, setEndsAt] = useState(suggested.endsAt);
  const [keepInvites, setKeepInvites] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const commitStart = (kind: 'date' | 'time', value: string) => {
    const next = kind === 'date' ? applyDateInput(startsAt, value) : applyTimeInput(startsAt, value);
    if (!next) return;
    const updated = changeWindowStart(startsAt, endsAt, next);
    setStartsAt(updated.startsAt);
    setEndsAt(updated.endsAt);
    setError(null);
  };

  const commitEnd = (kind: 'date' | 'time', value: string) => {
    const next = kind === 'date' ? applyDateInput(endsAt, value) : applyTimeInput(endsAt, value);
    if (!next) return;
    setEndsAt(changeWindowEnd(startsAt, next, kind));
    setError(null);
  };

  const dropAgain = async () => {
    if (busy) return;
    if (startsAt.getTime() < Date.now() - 60 * 1000) {
      setError('Start is in the past. Pick a later start.');
      return;
    }
    if (endsAt.getTime() <= startsAt.getTime()) {
      setError('End must be after start.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onRenew({ startsAt, endsAt, keepInvites });
    } catch (renewError) {
      setError(renewError instanceof Error ? renewError.message : 'Couldn’t drop it again. Try once more.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.card} testID="manage-renew">
      <View style={styles.header}>
        <RotateCw size={15} color="#22d3ee" strokeWidth={2.25} />
        <Text style={styles.heading}>DROP AGAIN</Text>
      </View>
      <Text style={styles.hint}>Same details, new dates. This ended Point stays in Past.</Text>

      <View style={styles.whenRow}>
        <Text style={styles.whenLabel}>Start</Text>
        <View style={styles.chips}>
          <WhenChip
            kind="date"
            date={startsAt}
            minimumDate={new Date()}
            display={formatBeaconDate(startsAt)}
            onCommit={(value) => commitStart('date', value)}
            testID="renew-start-date"
            label="Start date"
          />
          <WhenChip
            kind="time"
            date={startsAt}
            display={formatBeaconTime(startsAt)}
            onCommit={(value) => commitStart('time', value)}
            testID="renew-start-time"
            label="Start time"
          />
        </View>
      </View>
      <View style={styles.whenRow}>
        <Text style={styles.whenLabel}>End</Text>
        <View style={styles.chips}>
          <WhenChip
            kind="date"
            date={endsAt}
            minimumDate={startsAt}
            display={formatBeaconDate(endsAt)}
            onCommit={(value) => commitEnd('date', value)}
            testID="renew-end-date"
            label="End date"
          />
          <WhenChip
            kind="time"
            date={endsAt}
            display={formatBeaconTime(endsAt)}
            onCommit={(value) => commitEnd('time', value)}
            testID="renew-end-time"
            label="End time"
          />
        </View>
      </View>

      {point.invites.length > 0 ? (
        <TouchableOpacity
          style={styles.toggleRow}
          onPress={() => setKeepInvites((on) => !on)}
          accessibilityRole="switch"
          accessibilityState={{ checked: keepInvites }}
          accessibilityLabel="Keep the invite list"
          testID="renew-keep-invites"
        >
          <Text style={styles.toggleText}>
            Keep the invite list ({point.invites.length})
          </Text>
          <View style={[styles.toggle, keepInvites ? styles.toggleOn : styles.toggleOff]}>
            <View style={[styles.thumb, keepInvites && styles.thumbOn]} />
          </View>
        </TouchableOpacity>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TouchableOpacity
        style={[styles.button, busy && styles.buttonBusy]}
        onPress={dropAgain}
        disabled={busy}
        accessibilityRole="button"
        testID="renew-submit"
      >
        {busy ? <ActivityIndicator color="#070b13" style={styles.spinner} /> : null}
        <Text style={styles.buttonText}>{busy ? 'DROPPING' : 'DROP AGAIN'}</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#22d3ee',
    padding: 14,
    gap: 10,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heading: { color: '#94a3b8', fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  hint: { color: '#94a3b8', fontSize: 12, lineHeight: 17 },
  whenRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 38 },
  whenLabel: { color: '#cbd5e1', fontSize: 14, fontWeight: '500', width: 44 },
  chips: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  toggleText: { color: '#cbd5e1', fontSize: 13 },
  toggle: { width: 42, height: 24, borderRadius: 12, padding: 3, justifyContent: 'center' },
  toggleOn: { backgroundColor: '#22d3ee' },
  toggleOff: { backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155' },
  thumb: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#94a3b8' },
  thumbOn: { alignSelf: 'flex-end', backgroundColor: '#082f49' },
  error: { color: '#f59e0b', fontSize: 12, fontWeight: '600' },
  button: {
    marginTop: 2,
    backgroundColor: '#22d3ee',
    borderRadius: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonBusy: { opacity: 0.7 },
  spinner: { marginRight: 8 },
  buttonText: { color: '#070b13', fontSize: 13, fontWeight: '900', letterSpacing: 1.1 },
});
