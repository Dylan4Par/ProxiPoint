import React, { useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Image,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
  type GestureResponderEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { clampZoom, doubleTapZoom, MIN_SCALE, pinchZoom, type ZoomState } from '../../lib/photoZoom';

export interface ViewerPhoto {
  uri: string;
  /** Shown under the photo, e.g. "Photo: Warren Miller Entertainment". */
  credit?: string | null;
}

/** Two taps this close together (ms) zoom in or out. */
const DOUBLE_TAP_MS = 280;

/**
 * Full-screen photos: pinch to zoom, drag to pan while zoomed, double-tap to zoom in on a spot or
 * back out, and swipe between photos when there are several. Close with ✕ or the back button.
 * The zoom maths is in lib/photoZoom (tested).
 */
export const PhotoViewer: React.FC<{
  photos: ViewerPhoto[];
  /** Which photo to open on. */
  index?: number;
  visible: boolean;
  onClose: () => void;
}> = ({ photos, index = 0, visible, onClose }) => {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState(index);
  const [zoomed, setZoomed] = useState(false);
  const many = photos.length > 1;
  const current = photos[Math.min(page, photos.length - 1)];

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setPage(Math.round(e.nativeEvent.contentOffset.x / Math.max(1, width)));
  };

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent onShow={() => setPage(index)}>
      <View style={styles.backdrop} testID="photo-viewer">
        <FlatList
          data={photos}
          keyExtractor={(item, i) => `${i}-${item.uri}`}
          horizontal
          pagingEnabled
          // While a photo is zoomed, drags pan it instead of turning the page.
          scrollEnabled={many && !zoomed}
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={Math.min(index, Math.max(0, photos.length - 1))}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          onMomentumScrollEnd={onScrollEnd}
          renderItem={({ item }) => <ZoomablePhoto uri={item.uri} width={width} height={height} onZoomChange={setZoomed} />}
        />

        {/* Top: count and close */}
        <View style={[styles.top, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
          <Text style={styles.count}>{many ? `${page + 1} / ${photos.length}` : ''}</Text>
          <TouchableOpacity
            style={styles.close}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close photo"
            hitSlop={12}
            testID="photo-viewer-close"
          >
            <X size={22} color="#ffffff" strokeWidth={2.5} />
          </TouchableOpacity>
        </View>

        {/* Bottom: credit */}
        {current?.credit ? (
          <View style={[styles.bottom, { paddingBottom: insets.bottom + 14 }]} pointerEvents="none">
            <Text style={styles.credit} numberOfLines={2}>
              {current.credit}
            </Text>
          </View>
        ) : null}
      </View>
    </Modal>
  );
};

/** One photo that can be pinched, panned and double-tapped. */
const ZoomablePhoto: React.FC<{
  uri: string;
  width: number;
  height: number;
  onZoomChange: (zoomed: boolean) => void;
}> = ({ uri, width, height, onZoomChange }) => {
  const view = { width, height };
  const viewRef = useRef(view);
  viewRef.current = view;
  const state = useRef<ZoomState>({ scale: 1, x: 0, y: 0 });
  const scale = useRef(new Animated.Value(1)).current;
  const tx = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(0)).current;
  const zoomedRef = useRef(false);

  const apply = (next: ZoomState, animate = false) => {
    state.current = next;
    if (animate) {
      Animated.parallel([
        Animated.timing(scale, { toValue: next.scale, duration: 200, useNativeDriver: true }),
        Animated.timing(tx, { toValue: next.x, duration: 200, useNativeDriver: true }),
        Animated.timing(ty, { toValue: next.y, duration: 200, useNativeDriver: true }),
      ]).start();
    } else {
      scale.setValue(next.scale);
      tx.setValue(next.x);
      ty.setValue(next.y);
    }
    const isZoomed = next.scale > MIN_SCALE + 0.01;
    if (isZoomed !== zoomedRef.current) {
      zoomedRef.current = isZoomed;
      onZoomChange(isZoomed);
    }
  };

  // Touch points relative to the middle of the screen.
  const rel = (pageX: number, pageY: number) => ({ x: pageX - viewRef.current.width / 2, y: pageY - viewRef.current.height / 2 });

  const gesture = useRef({
    mode: 'none' as 'none' | 'pinch' | 'pan',
    start: { scale: 1, x: 0, y: 0 } as ZoomState,
    startFocus: { x: 0, y: 0 },
    startDistance: 1,
    baseDx: 0,
    baseDy: 0,
  });

  const twoFingers = (e: GestureResponderEvent) => e.nativeEvent.touches.length >= 2;
  const responder = useRef(
    PanResponder.create({
      // Two fingers always pinch (even taking over from the page swipe); one finger only pans
      // once zoomed in, so at 1x a swipe still turns the page.
      onStartShouldSetPanResponder: (e) => twoFingers(e),
      onStartShouldSetPanResponderCapture: (e) => twoFingers(e),
      onMoveShouldSetPanResponder: (e, g) => twoFingers(e) || (zoomedRef.current && Math.hypot(g.dx, g.dy) > 3),
      onMoveShouldSetPanResponderCapture: (e, g) => twoFingers(e) || (zoomedRef.current && Math.hypot(g.dx, g.dy) > 3),
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        gesture.current.mode = 'none';
      },
      onPanResponderMove: (e, g) => {
        const touches = e.nativeEvent.touches;
        const gs = gesture.current;
        if (touches.length >= 2) {
          const [a, b] = touches;
          const focus = rel((a.pageX + b.pageX) / 2, (a.pageY + b.pageY) / 2);
          const distance = Math.max(1, Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY));
          if (gs.mode !== 'pinch') {
            gs.mode = 'pinch';
            gs.start = { ...state.current };
            gs.startFocus = focus;
            gs.startDistance = distance;
          }
          apply(pinchZoom(gs.start, gs.startFocus, focus, distance / gs.startDistance, viewRef.current));
          return;
        }
        // One finger (also after lifting one from a pinch): pan from here.
        if (gs.mode !== 'pan') {
          gs.mode = 'pan';
          gs.start = { ...state.current };
          gs.baseDx = g.dx;
          gs.baseDy = g.dy;
        }
        apply(clampZoom({ ...gs.start, x: gs.start.x + g.dx - gs.baseDx, y: gs.start.y + g.dy - gs.baseDy }, viewRef.current));
      },
      onPanResponderRelease: () => {
        gesture.current.mode = 'none';
        // Pinched back to (about) 1x: settle exactly on the whole photo.
        if (state.current.scale < MIN_SCALE + 0.05) apply({ scale: 1, x: 0, y: 0 }, true);
      },
      onPanResponderTerminate: () => {
        gesture.current.mode = 'none';
      },
    }),
  ).current;

  // Double tap: zoom in on the spot, or back out.
  const lastTap = useRef(0);
  const onPress = (e: GestureResponderEvent) => {
    const now = Date.now();
    if (now - lastTap.current < DOUBLE_TAP_MS) {
      lastTap.current = 0;
      apply(doubleTapZoom(state.current, rel(e.nativeEvent.pageX, e.nativeEvent.pageY), viewRef.current), true);
    } else {
      lastTap.current = now;
    }
  };

  return (
    <View style={{ width, height }} {...responder.panHandlers}>
      <Pressable onPress={onPress} style={StyleSheet.absoluteFill} accessibilityLabel="Photo. Pinch or double-tap to zoom">
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateX: tx }, { translateY: ty }, { scale }] }]}>
          <Image source={{ uri }} style={{ width, height }} resizeMode="contain" />
        </Animated.View>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#000000' },
  top: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  count: { color: '#ffffff', fontSize: 14, fontWeight: '700', opacity: 0.9 },
  close: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, alignItems: 'center' },
  credit: { color: '#ffffff', fontSize: 12, opacity: 0.85, textAlign: 'center' },
});
