import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  type KeyboardEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
} from 'react-native';

/** Space kept between the field you're typing in and the top of the keyboard. */
const GAP = 24;

/**
 * Height of the on-screen keyboard (0 when it's hidden). Handy for sheets in a Modal:
 * add it as bottom margin so the sheet rides up above the keyboard.
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (e: KeyboardEvent) => setHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener(hideEvent, () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}

/**
 * Drop-in ScrollView that keeps the field you're typing in visible above the keyboard:
 * when the keyboard opens (or you tap another field while it's open) it scrolls just enough
 * to show the field, and adds room at the bottom so the last fields can scroll up too.
 * Works the same on Android (including edge-to-edge, where the screen no longer shrinks for
 * the keyboard) and iOS. Pure JavaScript, so no rebuild is needed.
 */
export const KeyboardAwareScrollView = forwardRef<ScrollView, ScrollViewProps>(
  ({ children, contentContainerStyle, onScroll, onTouchEnd, scrollEventThrottle, ...rest }, ref) => {
    const inner = useRef<ScrollView>(null);
    useImperativeHandle(ref, () => inner.current as ScrollView);
    const scrollY = useRef(0);
    const keyboardTop = useRef<number | null>(null);
    const [keyboardHeight, setKeyboardHeight] = useState(0);

    // Scroll so the focused field sits GAP above the keyboard (only if it's hidden behind it).
    const revealFocused = useCallback(() => {
      const top = keyboardTop.current;
      const input = TextInput.State.currentlyFocusedInput() as unknown as {
        measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void;
      } | null;
      if (top == null || !input?.measureInWindow || !inner.current) return;
      input.measureInWindow((_x, y, _w, h) => {
        // Multiline fields: keep the whole box in view, but never push its top off screen.
        const overlap = y + Math.min(h, 160) + GAP - top;
        if (overlap > 0) {
          inner.current?.scrollTo({ y: scrollY.current + overlap, animated: true });
        }
      });
    }, []);

    useEffect(() => {
      const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
      const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
      const show = Keyboard.addListener(showEvent, (e: KeyboardEvent) => {
        keyboardTop.current = e.endCoordinates.screenY;
        setKeyboardHeight(e.endCoordinates.height);
        // Wait a frame for the extra bottom room to be laid out, then scroll.
        setTimeout(revealFocused, Platform.OS === 'ios' ? 50 : 80);
      });
      const hide = Keyboard.addListener(hideEvent, () => {
        keyboardTop.current = null;
        setKeyboardHeight(0);
      });
      return () => {
        show.remove();
        hide.remove();
      };
    }, [revealFocused]);

    return (
      <ScrollView
        ref={inner}
        keyboardShouldPersistTaps="handled"
        {...rest}
        scrollEventThrottle={scrollEventThrottle ?? 16}
        onScroll={(event: NativeSyntheticEvent<NativeScrollEvent>) => {
          scrollY.current = event.nativeEvent.contentOffset.y;
          onScroll?.(event);
        }}
        onTouchEnd={(event) => {
          // Tapped another field while the keyboard is already open: bring that one into view.
          if (keyboardTop.current != null) setTimeout(revealFocused, 120);
          onTouchEnd?.(event);
        }}
        contentContainerStyle={[
          contentContainerStyle,
          // Room to scroll the lowest fields above the keyboard.
          keyboardHeight ? { paddingBottom: (StyleSheet.flatten(contentContainerStyle)?.paddingBottom as number | undefined ?? 0) + keyboardHeight } : null,
        ]}
      >
        {children}
      </ScrollView>
    );
  },
);
KeyboardAwareScrollView.displayName = 'KeyboardAwareScrollView';
