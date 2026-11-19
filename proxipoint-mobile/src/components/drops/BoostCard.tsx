import React, { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CircleCheck, CreditCard, LayoutList, MapPin, ShieldCheck, Timer, X, Zap } from 'lucide-react-native';
import {
  activeBoost,
  authorizeBoostPayment,
  BOOST_HOURS,
  BOOST_TEST_MODE,
  boostWindow,
  formatBoostPrice,
  formatTimeLeft,
  startBoost,
  useBoosts,
} from '../../lib/boost';
import { formatBeaconTime } from '../../lib/beaconWindow';
import type { DroppedPoint } from '../../lib/droppedPoint';
import { useTheme, useThemedStyles, type ThemeColors } from '../../theme/ThemeContext';

/** Gold used for everything Boost, in both themes. */
export const BOOST_GOLD = '#f59e0b';
export const BOOST_GOLD_SOFT = 'rgba(245, 158, 11, 0.14)';
export const BOOST_GOLD_BORDER = 'rgba(245, 158, 11, 0.55)';
const BOOST_INK = '#1f1300';

/**
 * Manage Point → Boost. Off: a BOOST button that opens the payment authorization.
 * On: time left and a bar that runs down over the 4 hours.
 */
export const BoostCard: React.FC<{ point: DroppedPoint }> = ({ point }) => {
  const styles = useThemedStyles(createStyles);
  const now = useBoosts();
  const boost = activeBoost(point.id, now);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  if (boost) {
    const total = new Date(boost.endsAt).getTime() - new Date(boost.startedAt).getTime();
    const left = Math.max(0, new Date(boost.endsAt).getTime() - now);
    const fraction = total > 0 ? left / total : 0;
    return (
      <View style={[styles.card, styles.cardOn]} testID="manage-boost-active">
        <View style={styles.row}>
          <View style={styles.boltBubble}>
            <Zap size={16} color={BOOST_INK} fill={BOOST_INK} strokeWidth={2} />
          </View>
          <View style={styles.copy}>
            <Text style={styles.onTitle}>BOOSTED · {formatTimeLeft(boost.endsAt, now)} left</Text>
            <Text style={styles.body}>
              Gold pin and top spot on Discover until {formatBeaconTime(new Date(boost.endsAt))}.
            </Text>
          </View>
        </View>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.round(fraction * 100)}%` }]} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.card} testID="manage-boost">
      <View style={styles.row}>
        <View style={styles.boltBubbleOff}>
          <Zap size={16} color={BOOST_GOLD} strokeWidth={2.25} />
        </View>
        <View style={styles.copy}>
          <Text style={styles.title}>Boost this Point</Text>
          <Text style={styles.body}>
            Stand out on Discover for {BOOST_HOURS} hours · {formatBoostPrice()}
          </Text>
        </View>
      </View>
      <TouchableOpacity
        style={styles.boostBtn}
        onPress={() => setCheckoutOpen(true)}
        accessibilityRole="button"
        testID="manage-boost-open"
      >
        <Zap size={16} color={BOOST_INK} fill={BOOST_INK} strokeWidth={2} />
        <Text style={styles.boostText}>BOOST</Text>
      </TouchableOpacity>
      <BoostCheckout point={point} visible={checkoutOpen} onClose={() => setCheckoutOpen(false)} />
    </View>
  );
};

type CheckoutStep = 'review' | 'authorizing' | 'done' | 'failed';

/** Payment authorization prompt for a boost. */
const BoostCheckout: React.FC<{ point: DroppedPoint; visible: boolean; onClose: () => void }> = ({
  point,
  visible,
  onClose,
}) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<CheckoutStep>('review');
  const [endsAt, setEndsAt] = useState<Date | null>(null);
  const preview = boostWindow(point.endsAt);

  const close = () => {
    if (step === 'authorizing') return; // wait for the answer
    setStep('review');
    onClose();
  };

  const authorize = async () => {
    setStep('authorizing');
    try {
      const payment = await authorizeBoostPayment(point.id);
      const boost = startBoost(point.id, payment, point.endsAt);
      setEndsAt(new Date(boost.endsAt));
      setStep('done');
    } catch {
      setStep('failed');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close}>
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 18 }]} testID="boost-checkout">
          <View style={styles.handle} />
          {step === 'done' ? (
            <View style={styles.done}>
              <CircleCheck size={34} color={c.green} strokeWidth={2.25} />
              <Text style={styles.sheetTitle}>Your Point is boosted</Text>
              <Text style={styles.sheetBody}>
                {point.title} has a gold pin and the top spot on Discover until{' '}
                {endsAt ? formatBeaconTime(endsAt) : ''}.
              </Text>
              <TouchableOpacity style={styles.payBtn} onPress={close} accessibilityRole="button" testID="boost-done">
                <Text style={styles.payText}>DONE</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={styles.sheetHeader}>
                <View style={styles.boltBubble}>
                  <Zap size={18} color={BOOST_INK} fill={BOOST_INK} strokeWidth={2} />
                </View>
                <View style={styles.copy}>
                  <Text style={styles.sheetTitle}>Boost this Point</Text>
                  <Text style={styles.sheetBody} numberOfLines={1}>
                    {point.title}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={close}
                  disabled={step === 'authorizing'}
                  style={styles.closeBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                >
                  <X size={18} color={c.textMuted} strokeWidth={2.25} />
                </TouchableOpacity>
              </View>

              <View style={styles.perks}>
                <Perk Icon={MapPin} text="Gold pin with a bolt on the Discover map" />
                <Perk Icon={LayoutList} text="BOOSTED tag and the top spot in the Discover list" />
                <Perk
                  Icon={Timer}
                  text={`${BOOST_HOURS} hours, starting now (until ${formatBeaconTime(preview.endsAt)})`}
                />
              </View>
              {preview.cutShort ? (
                <Text style={styles.warn}>
                  Your Point ends at {formatBeaconTime(preview.endsAt)}, so the boost stops then.
                </Text>
              ) : null}

              <Text style={styles.label}>PAY WITH</Text>
              <View style={styles.method}>
                <CreditCard size={18} color={c.textSecondary} strokeWidth={2} />
                <Text style={styles.methodText}>{BOOST_TEST_MODE ? 'Test card' : 'Card on file'}</Text>
                {BOOST_TEST_MODE ? (
                  <View style={styles.testPill}>
                    <Text style={styles.testPillText}>TEST MODE</Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.totalValue}>{formatBoostPrice()}</Text>
              </View>

              {step === 'failed' ? (
                <Text style={styles.warn}>The payment wasn’t authorized. Nothing was charged. Try again.</Text>
              ) : null}

              <TouchableOpacity
                style={[styles.payBtn, step === 'authorizing' && styles.payBtnBusy]}
                onPress={authorize}
                disabled={step === 'authorizing'}
                accessibilityRole="button"
                accessibilityLabel={`Authorize ${formatBoostPrice()} payment`}
                testID="boost-authorize"
              >
                {step === 'authorizing' ? (
                  <>
                    <ActivityIndicator color={BOOST_INK} />
                    <Text style={styles.payText}>AUTHORIZING…</Text>
                  </>
                ) : (
                  <Text style={styles.payText}>AUTHORIZE {formatBoostPrice()}</Text>
                )}
              </TouchableOpacity>

              <View style={styles.fine}>
                <ShieldCheck size={13} color={c.textMuted} strokeWidth={2} />
                <Text style={styles.fineText}>
                  {BOOST_TEST_MODE
                    ? 'Test mode: no real payment is taken. Boosts can’t be paused or refunded once they start.'
                    : 'You’re charged once the boost starts. Boosts can’t be paused or refunded once they start.'}
                </Text>
              </View>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const Perk: React.FC<{ Icon: typeof Zap; text: string }> = ({ Icon, text }) => {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.perk}>
      <Icon size={16} color={BOOST_GOLD} strokeWidth={2.25} />
      <Text style={styles.perkText}>{text}</Text>
    </View>
  );
};

/** Small gold "BOOSTED" chip for Discover cards and the detail sheet. */
export const BoostedChip: React.FC<{ testID?: string }> = ({ testID }) => {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.chip} accessibilityLabel="Boosted" testID={testID}>
      <Zap size={10} color={BOOST_GOLD} fill={BOOST_GOLD} strokeWidth={2} />
      <Text style={styles.chipText}>BOOSTED</Text>
    </View>
  );
};

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    card: {
      backgroundColor: c.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: BOOST_GOLD_BORDER,
      padding: 14,
      gap: 12,
    },
    cardOn: { backgroundColor: BOOST_GOLD_SOFT, borderColor: BOOST_GOLD, borderWidth: 1.5 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    copy: { flex: 1, gap: 2 },
    boltBubble: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: BOOST_GOLD,
      alignItems: 'center',
      justifyContent: 'center',
    },
    boltBubbleOff: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: BOOST_GOLD_SOFT,
      borderWidth: 1,
      borderColor: BOOST_GOLD_BORDER,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: { color: c.text, fontSize: 15, fontWeight: '800' },
    onTitle: { color: BOOST_GOLD, fontSize: 14, fontWeight: '900', letterSpacing: 0.6 },
    body: { color: c.textMuted, fontSize: 12, lineHeight: 17 },
    boostBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      minHeight: 46,
      borderRadius: 23,
      backgroundColor: BOOST_GOLD,
    },
    boostText: { color: BOOST_INK, fontSize: 14, fontWeight: '900', letterSpacing: 1.4 },
    track: { height: 6, borderRadius: 3, backgroundColor: 'rgba(245, 158, 11, 0.2)', overflow: 'hidden' },
    fill: { height: '100%', borderRadius: 3, backgroundColor: BOOST_GOLD },

    backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(2, 6, 23, 0.7)' },
    sheet: {
      backgroundColor: c.surface,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: 18,
      paddingTop: 10,
      gap: 12,
    },
    handle: { width: 44, height: 4, borderRadius: 2, backgroundColor: c.borderStrong, alignSelf: 'center', marginBottom: 4 },
    sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    sheetTitle: { color: c.text, fontSize: 18, fontWeight: '800' },
    sheetBody: { color: c.textMuted, fontSize: 13, lineHeight: 19 },
    closeBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    perks: {
      gap: 10,
      backgroundColor: c.base,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      padding: 12,
    },
    perk: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    perkText: { flex: 1, color: c.textBody, fontSize: 13, lineHeight: 18 },
    warn: { color: c.amber, fontSize: 12, fontWeight: '600', lineHeight: 17 },
    label: { color: c.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginTop: 2 },
    method: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    methodText: { flex: 1, color: c.text, fontSize: 14, fontWeight: '700' },
    testPill: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
      backgroundColor: BOOST_GOLD_SOFT,
      borderWidth: 1,
      borderColor: BOOST_GOLD_BORDER,
    },
    testPillText: { color: BOOST_GOLD, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
    totalRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      borderTopWidth: 1,
      borderTopColor: c.border,
      paddingTop: 12,
    },
    totalLabel: { color: c.textSecondary, fontSize: 15, fontWeight: '700' },
    totalValue: { color: c.text, fontSize: 20, fontWeight: '900' },
    payBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      minHeight: 50,
      borderRadius: 25,
      backgroundColor: BOOST_GOLD,
      alignSelf: 'stretch',
    },
    payBtnBusy: { opacity: 0.8 },
    payText: { color: BOOST_INK, fontSize: 14, fontWeight: '900', letterSpacing: 1.2 },
    fine: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
    fineText: { flex: 1, color: c.textMuted, fontSize: 11, lineHeight: 16 },
    done: { alignItems: 'center', gap: 10, paddingVertical: 8 },

    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      alignSelf: 'flex-start',
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 7,
      backgroundColor: BOOST_GOLD_SOFT,
      borderWidth: 1,
      borderColor: BOOST_GOLD_BORDER,
    },
    chipText: { color: BOOST_GOLD, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  });
