import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useAlertHistory } from '../../src/hooks/useAlertHistory';
import { useDeviceProfile } from '../../src/hooks/useDeviceProfile';

export default function SettingsScreen() {
  const { callsign, setCallsign, isTelemetryEnabled, setIsTelemetryEnabled, loading } = useDeviceProfile();
  const { entries, clearAlertHistory } = useAlertHistory();
  const [inputVal, setInputVal] = useState(callsign);

  useEffect(() => {
    if (!loading) setInputVal(callsign);
  }, [callsign, loading]);

  const handleSave = async () => {
    const next = inputVal.trim();
    if (!next) return;
    await setCallsign(next);
    Alert.alert('Settings Saved', `Callsign updated to "${next}".`);
  };

  const handleClearHistory = () => {
    const clear = () => {
      void clearAlertHistory();
    };
    if (Platform.OS === 'web') {
      if (window.confirm('Remove every saved proximity contact from this device?')) clear();
      return;
    }
    Alert.alert('Clear alert history', 'Remove every saved proximity contact from this device?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: clear },
    ]);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Device Configuration</Text>

      <View style={styles.section}>
        <Text style={styles.label}>Device Callsign / ID</Text>
        <TextInput
          style={styles.input}
          value={inputVal}
          onChangeText={setInputVal}
          placeholder="e.g. Echo-Leader"
          placeholderTextColor="#64748b"
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Device callsign"
          editable={!loading}
        />
        <Pressable
          style={[styles.saveBtn, (!inputVal.trim() || loading) && styles.saveBtnDisabled]}
          onPress={() => {
            void handleSave();
          }}
          disabled={!inputVal.trim() || loading}
          accessibilityRole="button"
          accessibilityLabel="Update callsign"
        >
          <Text style={styles.saveBtnText}>Update Callsign</Text>
        </Pressable>
      </View>

      <View style={styles.sectionRow}>
        <View style={styles.sectionCopy}>
          <Text style={styles.label}>Broadcast Telemetry</Text>
          <Text style={styles.subtext}>Transmit position to ProxiPoint server</Text>
        </View>
        <Switch
          value={isTelemetryEnabled}
          onValueChange={(enabled) => {
            void setIsTelemetryEnabled(enabled);
          }}
          disabled={loading}
          trackColor={{ false: '#334155', true: '#2563eb' }}
          accessibilityLabel="Broadcast telemetry"
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Alert History</Text>
        <Text style={styles.subtext}>
          {entries.length} saved {entries.length === 1 ? 'contact' : 'contacts'} from earlier breaches
        </Text>
        <Pressable
          style={styles.clearBtn}
          onPress={handleClearHistory}
          accessibilityRole="button"
          accessibilityLabel="Clear alert history"
        >
          <Text style={styles.clearBtnText}>Clear Alert History</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#070b12', padding: 16, paddingTop: 48 },
  header: { fontSize: 22, fontWeight: '700', color: '#f8fafc', marginBottom: 24 },
  section: {
    backgroundColor: '#1e293b',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  sectionRow: {
    backgroundColor: '#1e293b',
    borderRadius: 8,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 16,
    gap: 12,
  },
  sectionCopy: { flex: 1 },
  label: { color: '#e2e8f0', fontSize: 15, fontWeight: '600', marginBottom: 6 },
  subtext: { color: '#64748b', fontSize: 12 },
  input: {
    backgroundColor: '#0f172a',
    borderRadius: 6,
    padding: 10,
    color: '#ffffff',
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 10,
  },
  saveBtn: { backgroundColor: '#2563eb', paddingVertical: 10, borderRadius: 6, alignItems: 'center' },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: '#ffffff', fontWeight: '600', fontSize: 13 },
  clearBtn: {
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#7f1d1d',
    backgroundColor: 'rgba(127, 29, 29, 0.35)',
  },
  clearBtnText: { color: '#fecaca', fontWeight: '600', fontSize: 13 },
});
