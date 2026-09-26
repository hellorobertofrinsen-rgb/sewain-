import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { queryClient } from "@/src/query-client";
import { Icon } from "./Icon";
import { cardShadow, useTheme } from "@/src/theme";
import { EASE_OUT } from "@/src/motion";

// Pull down from the top of any screen to refresh, like a social feed.
//
// React Native Web has no RefreshControl, and the page's own pull-to-refresh is
// switched off (overscroll-behavior: none) so the app feels installed. So this
// listens on the document and works on every screen:
//   - touch (iPhone, Android, iPad, tablets): drag down while the list is at the top
//   - desktop: trackpad swipe / wheel up while already at the top
// The indicator follows the finger with rubber-band resistance; past the threshold it
// spins while every visible query refetches. Sheets and the side menu opt out
// (data-no-ptr), since dragging down there dismisses them.

const THRESHOLD = 72; // px of (resisted) pull needed to refresh
const WHEEL_THRESHOLD = 160;

function resist(d: number) {
  return (d * 0.5 * 160) / (160 + d * 0.5); // rubber band: tops out around 160px
}

function scrollableAncestor(el: Element | null): HTMLElement | null {
  let n = el as HTMLElement | null;
  while (n && n !== document.body) {
    const oy = getComputedStyle(n).overflowY;
    if ((oy === "auto" || oy === "scroll") && n.scrollHeight > n.clientHeight + 1) return n;
    n = n.parentElement;
  }
  return null;
}

function blocked(el: Element | null) {
  return !!(el as HTMLElement | null)?.closest?.('[data-no-ptr="1"], input, textarea, [role="dialog"]');
}

export function PullToRefresh() {
  if (Platform.OS !== "web") return null;
  return <WebPullToRefresh />;
}

function WebPullToRefresh() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const pull = useSharedValue(0);
  const [refreshing, setRefreshing] = useState(false);
  const busy = useRef(false);

  useEffect(() => {
    let startY = 0;
    let startX = 0;
    let tracking = false;
    let pulling = false;
    let wheel = 0;
    let wheelTimer: ReturnType<typeof setTimeout> | null = null;

    const settle = () => pull.set(withTiming(0, { duration: 200, easing: EASE_OUT }));

    const refresh = async () => {
      if (busy.current) return;
      busy.current = true;
      setRefreshing(true);
      pull.set(withTiming(THRESHOLD, { duration: 150, easing: EASE_OUT }));
      try {
        await queryClient.refetchQueries({ type: "active" });
      } finally {
        busy.current = false;
        setRefreshing(false);
        settle();
      }
    };

    const onStart = (e: TouchEvent) => {
      if (busy.current || e.touches.length !== 1 || blocked(e.target as Element)) return;
      const sc = scrollableAncestor(e.target as Element);
      if (sc && sc.scrollTop > 0) return;
      tracking = true;
      pulling = false;
      startY = e.touches[0].clientY;
      startX = e.touches[0].clientX;
    };
    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      const dy = e.touches[0].clientY - startY;
      const dx = Math.abs(e.touches[0].clientX - startX);
      if (!pulling) {
        if (dy < 8 || dx > dy) {
          if (dy < -4 || dx > 12) tracking = false; // scrolling up or sideways: not a pull
          return;
        }
        pulling = true;
      }
      if (e.cancelable) e.preventDefault(); // keep the page from bouncing under the finger
      pull.set(resist(Math.max(0, dy)));
    };
    const onEnd = () => {
      if (!tracking) return;
      tracking = false;
      if (pulling && pull.get() >= THRESHOLD) refresh();
      else settle();
      pulling = false;
    };
    const onWheel = (e: WheelEvent) => {
      if (busy.current || e.deltaY >= 0 || blocked(e.target as Element)) return;
      const sc = scrollableAncestor(e.target as Element);
      if (sc && sc.scrollTop > 0) {
        wheel = 0;
        return;
      }
      wheel += -e.deltaY;
      pull.set(resist(Math.min(wheel, WHEEL_THRESHOLD * 1.5)) * (THRESHOLD / resist(WHEEL_THRESHOLD)));
      if (wheelTimer) clearTimeout(wheelTimer);
      if (wheel >= WHEEL_THRESHOLD) {
        wheel = 0;
        refresh();
        return;
      }
      wheelTimer = setTimeout(() => {
        wheel = 0;
        if (!busy.current) settle();
      }, 220);
    };

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd);
    document.addEventListener("touchcancel", onEnd);
    window.addEventListener("wheel", onWheel, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onEnd);
      window.removeEventListener("wheel", onWheel);
      if (wheelTimer) clearTimeout(wheelTimer);
    };
  }, [pull]);

  const style = useAnimatedStyle(() => {
    const p = pull.get();
    return {
      opacity: Math.min(1, p / (THRESHOLD * 0.6)),
      transform: [{ translateY: p - 48 }, { scale: reduced ? 1 : 0.7 + 0.3 * Math.min(1, p / THRESHOLD) }],
    };
  });
  const arrow = useAnimatedStyle(() => ({ transform: [{ rotate: `${Math.min(1, pull.get() / THRESHOLD) * 180}deg` }] }));

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: 1500 }]} testID="pull-to-refresh">
      <Animated.View style={[styles.bubble, { top: insets.top + 8, backgroundColor: colors.surfaceSecondary }, style]}>
        {refreshing ? (
          <ActivityIndicator size="small" color={colors.brandPrimary} testID="ptr-spinner" />
        ) : (
          <Animated.View style={arrow}>
            <Icon name="refresh" size={20} color={colors.brandPrimary} />
          </Animated.View>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    position: "absolute",
    alignSelf: "center",
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    ...cardShadow,
  },
});
