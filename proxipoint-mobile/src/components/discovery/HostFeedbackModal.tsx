import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface Props {
  visible: boolean;
  callsign: string;
  onUpvote: () => void;
  onSkip: () => void;
}

export const HostFeedbackModal: React.FC<Props> = ({ visible, callsign, onUpvote, onSkip }) => {
  const host = callsign.trim() || 'this host';
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onSkip}>
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityRole="summary">
          <Text style={styles.kicker}>POST-EVENT TRUST CHECK</Text>
          <Text style={styles.prompt}>Did {host} run a good drop?</Text>
          <TouchableOpacity
            style={styles.upvoteBtn}
            onPress={onUpvote}
            accessibilityRole="button"
            accessibilityLabel={`Upvote host ${host}`}
          >
            <Text style={styles.upvoteText}>👍 Upvote Host</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.skipBtn}
            onPress={onSkip}
            accessibilityRole="button"
            accessibilityLabel="Skip host feedback"
          >
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#0f172a',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#1e293b',
    padding: 18,
  },
  kicker: {
    color: '#22d3ee',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  prompt: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24,
    marginBottom: 16,
  },
  upvoteBtn: {
    backgroundColor: '#facc15',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  upvoteText: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '800',
  },
  skipBtn: {
    marginTop: 8,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  skipText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '700',
  },
});
