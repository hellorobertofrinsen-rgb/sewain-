import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, View, useWindowDimensions } from "react-native";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { cardShadow, makeStyles } from "@/src/theme";
import { DURATION, EASE_OUT, EASE_SHEET, SPRING_SETTLE } from "@/src/motion";
import { t } from "@/src/lib/i18n";

// Side menu from the left edge. Same motion rules as the bottom Sheet: opens on the
// iOS sheet curve, closes faster, follows the finger when dragged left and carries
// the release velocity. Backdrop opacity is derived from the panel position.
// Reduced motion: a cross-fade.

function now() {
  "worklet";
  return Date.now();
}

export function Drawer({ open, onClose, children, testID }: { open: boolean; onClose: () => void; children: React.ReactNode; testID?: string }) {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const width = Math.min(340, Math.round(winW * 0.84));
  const reduced = useReducedMotion();

  const [leaving, setLeaving] = useState(false);
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (!open) setLeaving(true);
  }
  const mounted = open || leaving;

  const x = useSharedValue(-width);
  const progress = useSharedValue(0);
  const dragStart = useSharedValue(0);
  const lastMoveAt = useSharedValue(0);
  const closing = useRef(false);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (open) {
      closing.current = false;
      if (reduced) {
        x.set(0);
        progress.set(withTiming(1, { duration: DURATION.sheetOut, easing: EASE_OUT, reduceMotion: ReduceMotion.Never }));
      } else {
        progress.set(1);
        x.set(-width);
        x.set(withTiming(0, { duration: DURATION.sheetIn, easing: EASE_SHEET }));
      }
      return;
    }
    const done = (finished?: boolean) => {
      "worklet";
      if (finished) scheduleOnRN(setLeaving, false);
    };
    if (reduced) progress.set(withTiming(0, { duration: DURATION.sheetOut, easing: EASE_OUT, reduceMotion: ReduceMotion.Never }, done));
    else x.set(withTiming(-width, { duration: DURATION.sheetOut, easing: EASE_OUT }, done));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const requestClose = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    onCloseRef.current();
  }, []);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-10, 10])
        .onStart(() => {
          dragStart.set(x.get());
        })
        .onUpdate((e) => {
          lastMoveAt.set(now());
          x.set(Math.min(0, dragStart.get() + e.translationX));
        })
        // eslint-disable-next-line react-hooks/refs -- gesture callbacks run on the UI thread, never during render
        .onEnd((e) => {
          const velocity = now() - lastMoveAt.get() > 60 ? 0 : e.velocityX;
          const projected = x.get() + velocity * 0.2;
          if (projected < -width * 0.4) {
            scheduleOnRN(requestClose);
          } else {
            x.set(withSpring(0, { ...SPRING_SETTLE, velocity }));
          }
        }),
    [x, dragStart, lastMoveAt, width, requestClose],
  );

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: reduced ? progress.get() : interpolate(x.get(), [-width, 0], [0, 1], Extrapolation.CLAMP),
  }));
  const panelStyle = useAnimatedStyle(() => ({
    opacity: reduced ? progress.get() : 1,
    transform: [{ translateX: x.get() }],
  }));

  if (!mounted) return null;
  return (
    <Modal visible transparent animationType="none" onRequestClose={requestClose} statusBarTranslucent>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View style={[s.backdrop, backdropStyle]} />
        <Pressable style={{ flex: 1 }} onPress={requestClose} accessibilityLabel={t("Tutup menu")} />
        <GestureDetector gesture={pan}>
          <Animated.View testID={testID} {...({ dataSet: { noPtr: "1" } } as any)} style={[s.panel, { width, paddingTop: insets.top, paddingBottom: insets.bottom }, panelStyle]}>
            <View style={{ flex: 1 }}>{children}</View>
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
}

const useStyles = makeStyles((colors) => ({
  backdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(22,24,29,0.38)" },
  panel: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.surfaceSecondary,
    borderTopRightRadius: 28,
    borderBottomRightRadius: 28,
    ...cardShadow,
  },
}));
