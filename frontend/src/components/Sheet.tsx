import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, Text as RNText, View, useWindowDimensions } from "react-native";
import Animated, {
  Extrapolation,
  ReduceMotion,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import { scheduleOnRN } from "react-native-worklets";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fonts, makeStyles, radius, spacing } from "@/src/theme";
import { DURATION, EASE_OUT, EASE_SHEET, SPRING_SETTLE } from "@/src/motion";

// Where a flick was going if the finger kept decelerating (Apple's exponential decay),
// so a quick short swipe dismisses and a slow long drag doesn't.
function project(velocity: number, decelerationRate = 0.998) {
  "worklet";
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

function now() {
  "worklet";
  return Date.now();
}

// Past the top edge the sheet resists instead of stopping dead.
function rubberband(overshoot: number, dimension: number, constant = 0.55) {
  "worklet";
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

/**
 * Bottom sheet. Opens on the iOS sheet curve, closes faster than it opens, and can be
 * dragged down by its grabber (velocity OR distance dismisses; the release velocity is
 * handed to the spring so there is no seam). The backdrop is derived from the sheet's
 * position, so it always stays in sync. Reduced motion: a plain cross-fade.
 *
 * Closing the sheet by tapping the backdrop, dragging or Escape animates out first and
 * then calls onClose. When the parent hides it (visible=false) it also animates out,
 * keeping the last content on screen while it leaves.
 */
export function Sheet({
  visible,
  onClose,
  title,
  children,
  scroll = false,
  testID,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  scroll?: boolean;
  testID?: string;
}) {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const reduced = useReducedMotion();

  // Mounted while visible, and while it is animating away after being hidden.
  const [leaving, setLeaving] = useState(false);
  const [prevVisible, setPrevVisible] = useState(visible);
  // Keep showing the last content while the sheet animates away (derived state).
  const [shown, setShown] = useState({ title, children });
  if (visible !== prevVisible) {
    setPrevVisible(visible);
    if (!visible) setLeaving(true);
  }
  if (visible && (shown.title !== title || shown.children !== children)) setShown({ title, children });
  const mounted = visible || leaving;

  const closing = useRef(false);
  const laidOut = useRef(false);
  const onCloseRef = useRef(onClose);
  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  });

  const translateY = useSharedValue(winH); // starts off-screen
  const sheetH = useSharedValue(winH);
  const progress = useSharedValue(0); // reduced-motion cross-fade
  const dragStart = useSharedValue(0);
  const lastMoveAt = useSharedValue(0);

  const animateIn = useCallback(() => {
    if (reduced) {
      translateY.set(0);
      // The cross-fade IS the reduced-motion version, so it must not be skipped as well.
      progress.set(withTiming(1, { duration: DURATION.sheetOut, easing: EASE_OUT, reduceMotion: ReduceMotion.Never }));
    } else {
      progress.set(1);
      translateY.set(withTiming(0, { duration: DURATION.sheetIn, easing: EASE_SHEET }));
    }
  }, [reduced, translateY, progress]);

  const animateOut = useCallback(
    (done: () => void) => {
      const finish = (finished?: boolean) => {
        "worklet";
        if (finished) scheduleOnRN(done);
      };
      if (reduced) {
        progress.set(withTiming(0, { duration: DURATION.sheetOut, easing: EASE_OUT, reduceMotion: ReduceMotion.Never }, finish));
      } else {
        translateY.set(withTiming(sheetH.get(), { duration: DURATION.sheetOut, easing: EASE_OUT }, finish));
      }
    },
    [reduced, translateY, progress, sheetH],
  );

  const finishLeaving = useCallback(() => {
    laidOut.current = false;
    setLeaving(false);
  }, []);

  useEffect(() => {
    if (visible) {
      closing.current = false;
      if (laidOut.current) animateIn(); // re-opened while still on screen
      return;
    }
    // Hidden by the parent: animate out (a no-op if we already did before onClose), then unmount.
    closing.current = true;
    animateOut(finishLeaving);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const requestClose = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    animateOut(() => onCloseRef.current());
  }, [animateOut]);

  const closeAfterDrag = useCallback(() => {
    closing.current = true;
    onCloseRef.current();
  }, []);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-8, 8])
        .onStart(() => {
          dragStart.set(translateY.get()); // continue from where the eye last saw it
        })
        .onUpdate((e) => {
          lastMoveAt.set(now());
          const next = dragStart.get() + e.translationY;
          translateY.set(next >= 0 ? next : rubberband(next, sheetH.get()));
        })
        // eslint-disable-next-line react-hooks/refs -- gesture callbacks run on the UI thread, never during render
        .onEnd((e) => {
          // A finger that stopped before lifting isn't flicking (native platforms treat a
          // pointer idle for ~50ms as stopped; the web recognizer keeps the old velocity).
          const velocity = now() - lastMoveAt.get() > 60 ? 0 : e.velocityY;
          const projected = translateY.get() + project(velocity);
          if (projected > sheetH.get() * 0.4) {
            translateY.set(
              withSpring(
                sheetH.get(),
                { duration: 300, dampingRatio: 1, velocity, overshootClamping: true },
                (finished) => {
                  if (finished) scheduleOnRN(closeAfterDrag);
                },
              ),
            );
          } else {
            translateY.set(withSpring(0, { ...SPRING_SETTLE, velocity }));
          }
        }),
    [translateY, sheetH, dragStart, lastMoveAt, closeAfterDrag],
  );

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: reduced
      ? progress.get()
      : interpolate(translateY.get(), [0, sheetH.get()], [1, 0], Extrapolation.CLAMP),
  }));
  const sheetStyle = useAnimatedStyle(() => ({
    opacity: reduced ? progress.get() : 1,
    transform: [{ translateY: translateY.get() }],
  }));

  if (!mounted) return null;
  const { title: shownTitle, children: shownChildren } = shown;

  return (
    <Modal visible transparent animationType="none" onRequestClose={requestClose} statusBarTranslucent>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View style={[s.backdrop, backdropStyle]} />
        <Pressable style={{ flex: 1 }} onPress={requestClose} accessibilityLabel="Tutup" />
        <Animated.View
          testID={testID}
          onLayout={(e) => {
            sheetH.set(e.nativeEvent.layout.height);
            if (!laidOut.current && !closing.current) {
              laidOut.current = true;
              if (!reduced) translateY.set(e.nativeEvent.layout.height);
              animateIn();
            }
          }}
          style={[s.sheet, { paddingBottom: insets.bottom + spacing.lg }, sheetStyle]}
        >
          <GestureDetector gesture={pan}>
            <View style={s.dragZone} accessibilityHint="Seret ke bawah untuk menutup">
              <View style={s.handle} />
              {shownTitle ? <RNText style={s.title}>{shownTitle}</RNText> : null}
            </View>
          </GestureDetector>
          {scroll ? (
            <KeyboardAwareScrollView bottomOffset={24} showsVerticalScrollIndicator={false} style={s.scroll}>
              {shownChildren}
            </KeyboardAwareScrollView>
          ) : (
            shownChildren
          )}
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const useStyles = makeStyles((colors) => ({
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  sheet: {
    backgroundColor: colors.surfaceSecondary,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    maxHeight: "88%",
    width: "100%",
    maxWidth: 600, // desktop: a sheet, not a full-width banner
    alignSelf: "center",
  },
  dragZone: { paddingTop: spacing.sm, paddingBottom: spacing.md, cursor: "grab" as any },
  handle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    marginBottom: spacing.md,
  },
  title: {
    color: colors.onSurface,
    fontFamily: fonts.semibold,
    fontSize: 17,
  },
  scroll: { overscrollBehavior: "contain" } as any,
}));
