import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, Modal, PanResponder, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { finishCrop, getCropRequest, subscribeCrop, type CropSource } from '../../lib/circleCrop';

const ACCENT = '#22d3ee';
const MAX_ZOOM = 4;

/**
 * Mount once (the Discover screen does). Full-screen cropper with a circle guide: drag to move,
 * pinch to zoom. What's inside the circle is what shows on your profile / the Point's pin.
 */
export const CircleCropHost: React.FC = () => {
  const [source, setSource] = useState<CropSource | null>(getCropRequest());
  useEffect(() => subscribeCrop(() => setSource(getCropRequest())), []);
  if (!source) return null;
  // Remount for each photo so the position starts fresh.
  return <Cropper key={source.uri} source={source} />;
};

const Cropper: React.FC<{ source: CropSource }> = ({ source }) => {
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = Dimensions.get('window');
  const side = Math.min(screenW - 32, screenH - 260); // the crop square (circle inside it)
  const imgW = Math.max(1, source.width);
  const imgH = Math.max(1, source.height);
  // At zoom 1 the photo just covers the square.
  const base = side / Math.min(imgW, imgH);
  const dispW = imgW * base;
  const dispH = imgH * base;

  const tx = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(0)).current;
  const sc = useRef(new Animated.Value(1)).current;
  const pos = useRef({ x: 0, y: 0, s: 1 });
  const gesture = useRef({ x: 0, y: 0, s: 1, dist: 0, pinching: false });

  // Keep the square covered: the photo can't be dragged past its own edges.
  const clamp = (x: number, y: number, s: number) => {
    const maxX = Math.max(0, (dispW * s - side) / 2);
    const maxY = Math.max(0, (dispH * s - side) / 2);
    return { x: Math.min(maxX, Math.max(-maxX, x)), y: Math.min(maxY, Math.max(-maxY, y)), s };
  };

  const apply = (next: { x: number; y: number; s: number }) => {
    pos.current = next;
    tx.setValue(next.x);
    ty.setValue(next.y);
    sc.setValue(next.s);
  };

  const distance = (touches: ReadonlyArray<{ pageX: number; pageY: number }>) =>
    Math.hypot(touches[0].pageX - touches[1].pageX, touches[0].pageY - touches[1].pageY);

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          gesture.current = { ...pos.current, dist: 0, pinching: false };
        },
        onPanResponderMove: (event, g) => {
          const touches = event.nativeEvent.touches;
          if (touches.length >= 2) {
            // Pinch: zoom from the size when the second finger landed.
            const d = distance(touches);
            if (!gesture.current.pinching) {
              gesture.current = { ...pos.current, dist: d, pinching: true };
              return;
            }
            const s = Math.min(MAX_ZOOM, Math.max(1, gesture.current.s * (d / Math.max(1, gesture.current.dist))));
            const ratio = s / gesture.current.s;
            apply(clamp(gesture.current.x * ratio, gesture.current.y * ratio, s));
            return;
          }
          if (gesture.current.pinching) {
            // Back to one finger: carry on dragging from here.
            gesture.current = { ...pos.current, dist: 0, pinching: false };
            return;
          }
          apply(clamp(gesture.current.x + g.dx, gesture.current.y + g.dy, gesture.current.s));
        },
        onPanResponderRelease: () => {
          gesture.current.pinching = false;
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [side, dispW, dispH],
  );

  const done = () => {
    const { x, y, s } = pos.current;
    const k = base * s; // screen points per photo pixel
    const size = side / k;
    const originX = (dispW * s / 2 - side / 2 - x) / k;
    const originY = (dispH * s / 2 - side / 2 - y) / k;
    finishCrop({
      originX: Math.max(0, Math.min(imgW - size, Math.round(originX))),
      originY: Math.max(0, Math.min(imgH - size, Math.round(originY))),
      width: Math.floor(Math.min(size, imgW, imgH)),
      height: Math.floor(Math.min(size, imgW, imgH)),
    });
  };

  const areaH = screenH - insets.top - insets.bottom - 150;
  const cx = screenW / 2;
  const cy = areaH / 2;
  const r = side / 2;
  // Dark everywhere except the circle (even-odd: outer rectangle with a round hole).
  const mask = `M0 0H${screenW}V${areaH}H0Z M${cx - r} ${cy} a${r} ${r} 0 1 0 ${side} 0 a${r} ${r} 0 1 0 ${-side} 0Z`;

  return (
    <Modal visible animationType="fade" onRequestClose={() => finishCrop(null)} statusBarTranslucent>
      <View style={[styles.screen, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12 }]} testID="circle-crop">
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => finishCrop(null)} style={styles.topBtn} accessibilityRole="button" testID="crop-cancel">
            <Text style={styles.cancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Move and scale</Text>
          <TouchableOpacity onPress={done} style={styles.topBtn} accessibilityRole="button" testID="crop-done">
            <Text style={styles.done}>Done</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.area, { height: areaH }]} {...responder.panHandlers}>
          <Animated.Image
            source={{ uri: source.uri }}
            style={{
              position: 'absolute',
              width: dispW,
              height: dispH,
              left: cx - dispW / 2,
              top: cy - dispH / 2,
              transform: [{ translateX: tx }, { translateY: ty }, { scale: sc }],
            }}
            resizeMode="cover"
          />
          <Svg width={screenW} height={areaH} style={styles.overlay} pointerEvents="none">
            <Path d={mask} fill="rgba(0, 0, 0, 0.62)" fillRule="evenodd" />
            {/* Same dashed ring as the profile picture */}
            <Circle cx={cx} cy={cy} r={r - 1} stroke={ACCENT} strokeWidth={2} strokeDasharray="10 7" fill="none" />
          </Svg>
        </View>

        <Text style={styles.hint}>Drag to move · pinch to zoom</Text>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    height: 52,
  },
  topBtn: { paddingHorizontal: 12, paddingVertical: 10 },
  cancel: { color: '#e2e8f0', fontSize: 16, fontWeight: '600' },
  title: { color: '#f8fafc', fontSize: 16, fontWeight: '800' },
  done: { color: ACCENT, fontSize: 16, fontWeight: '800' },
  area: { overflow: 'hidden', marginTop: 12 },
  overlay: { position: 'absolute', top: 0, left: 0 },
  hint: { color: '#94a3b8', fontSize: 13, textAlign: 'center', marginTop: 16 },
});
