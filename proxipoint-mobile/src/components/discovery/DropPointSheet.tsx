import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useDiscoveryStore } from '../../stores/useDiscoveryStore';

export const DropPointSheet: React.FC = () => {
  const open = useDiscoveryStore((state) => state.dropSheetOpen);
  const setOpen = useDiscoveryStore((state) => state.setDropSheetOpen);
  const tags = useDiscoveryStore((state) => state.tags);
  const dropBeacon = useDiscoveryStore((state) => state.dropBeacon);

  const tagChoices = tags.filter((tag) => tag !== 'All');
  const [title, setTitle] = useState('');
  const [venue, setVenue] = useState('');
  const [tag, setTag] = useState(tagChoices[0] ?? '#LiveMusic');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    const state = useDiscoveryStore.getState();
    const choices = state.tags.filter((item) => item !== 'All');
    setTitle('');
    setVenue('');
    setTag(choices[0] ?? '#LiveMusic');
    setLatitude(state.selfCoordinates.latitude.toFixed(6));
    setLongitude(state.selfCoordinates.longitude.toFixed(6));
    setError('');
  }, [open]);

  const handleDrop = () => {
    const trimmedTitle = title.trim();
    const lat = Number(latitude);
    const lon = Number(longitude);
    if (!trimmedTitle) {
      setError('Name the beacon before dropping it.');
      return;
    }
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) {
      setError('Enter a latitude and longitude on the map.');
      return;
    }
    dropBeacon({
      title: trimmedTitle,
      tag,
      venue,
      latitude: lat,
      longitude: lon,
    });
  };

  return (
    <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
      <TouchableWithoutFeedback onPress={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <TouchableWithoutFeedback>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <View style={styles.sheet}>
                <View style={styles.pullBar} />
                <View style={styles.headerRow}>
                  <View>
                    <Text style={styles.kicker}>HOST A BEACON</Text>
                    <Text style={styles.title}>Drop Point</Text>
                  </View>
                  <TouchableOpacity onPress={() => setOpen(false)} hitSlop={8}>
                    <Text style={styles.close}>✕</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.subtitle}>
                  Publish a live beacon at these coordinates. It joins the map and opens in the card sheet.
                </Text>

                <ScrollView keyboardShouldPersistTaps="handled" style={styles.form}>
                  <Text style={styles.label}>Beacon name</Text>
                  <TextInput
                    style={styles.input}
                    value={title}
                    onChangeText={setTitle}
                    placeholder="Night market, pickup game..."
                    placeholderTextColor="#475569"
                    returnKeyType="next"
                  />

                  <Text style={styles.label}>Host / place</Text>
                  <TextInput
                    style={styles.input}
                    value={venue}
                    onChangeText={setVenue}
                    placeholder="Pearl Street Mall"
                    placeholderTextColor="#475569"
                  />

                  <Text style={styles.label}>Channel</Text>
                  <View style={styles.tagRow}>
                    {tagChoices.map((choice) => {
                      const active = choice === tag;
                      return (
                        <TouchableOpacity
                          key={choice}
                          style={[styles.tagChip, active && styles.tagChipActive]}
                          onPress={() => setTag(choice)}
                        >
                          <Text style={[styles.tagText, active && styles.tagTextActive]}>{choice}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <View style={styles.coordRow}>
                    <View style={styles.coordField}>
                      <Text style={styles.label}>Latitude</Text>
                      <TextInput
                        style={styles.input}
                        value={latitude}
                        onChangeText={setLatitude}
                        keyboardType="numbers-and-punctuation"
                        autoCapitalize="none"
                      />
                    </View>
                    <View style={styles.coordField}>
                      <Text style={styles.label}>Longitude</Text>
                      <TextInput
                        style={styles.input}
                        value={longitude}
                        onChangeText={setLongitude}
                        keyboardType="numbers-and-punctuation"
                        autoCapitalize="none"
                      />
                    </View>
                  </View>

                  {error ? <Text style={styles.error}>{error}</Text> : null}
                </ScrollView>

                <TouchableOpacity style={styles.dropBtn} onPress={handleDrop}>
                  <Text style={styles.dropBtnText}>Drop beacon</Text>
                </TouchableOpacity>
              </View>
            </KeyboardAvoidingView>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.72)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#0b1220',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: '#1e293b',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
    maxHeight: '88%',
  },
  pullBar: {
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#334155',
    alignSelf: 'center',
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  kicker: {
    color: '#22d3ee',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  title: {
    color: '#f8fafc',
    fontSize: 22,
    fontWeight: '700',
    marginTop: 2,
  },
  close: {
    color: '#94a3b8',
    fontSize: 18,
    fontWeight: '700',
    padding: 4,
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 8,
    marginBottom: 14,
  },
  form: {
    flexGrow: 0,
  },
  label: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#111827',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
    color: '#f8fafc',
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    marginBottom: 12,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  tagChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#334155',
  },
  tagChipActive: {
    backgroundColor: '#06b6d4',
    borderColor: '#22d3ee',
  },
  tagText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  tagTextActive: {
    color: '#082f49',
    fontWeight: '700',
  },
  coordRow: {
    flexDirection: 'row',
    gap: 10,
  },
  coordField: {
    flex: 1,
  },
  error: {
    color: '#fb7185',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
  dropBtn: {
    backgroundColor: '#22d3ee',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  dropBtnText: {
    color: '#082f49',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});
