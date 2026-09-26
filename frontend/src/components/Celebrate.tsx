import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { StyleSheet, Text as RNText, View } from "react-native";
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { fonts, radius, spacing, useTheme, cardShadow } from "@/src/theme";
import { EASE_OUT } from "@/src/motion";

// A rare, earned moment (a deal closed): a short confetti burst plus a card with the
// news. Everyday actions never use this — delight wears off when it repeats.
// Reduced motion: no confetti, the card just fades in and out.

const PIECES = 22;
const COLORS = ["#2457D6", "#6E9BF0", "#F7D9C4", "#8DB38F", "#E8A33D", "#C9DAFB"];
const BURST_MS = 1100;
const HOLD_MS = 1500;

type Ctx = { celebrate: (title: string, sub?: string) => void };
const CelebrateCtx = createContext<Ctx>({ celebrate: () => {} });

export function useCelebrate() {
  return useContext(CelebrateCtx);
}

export function CelebrateProvider({ children }: { children: React.ReactNode }) {
  const [shot, setShot] = useState<{ id: number; title: string; sub?: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const celebrate = useCallback((title: string, sub?: string) => {
    if (timer.current) clearTimeout(timer.current);
    setShot({ id: Date.now(), title, sub });
    timer.current = setTimeout(() => setShot(null), BURST_MS + HOLD_MS);
  }, []);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return (
    <CelebrateCtx.Provider value={{ celebrate }}>
      {children}
      {shot ? <Burst key={shot.id} title={shot.title} sub={shot.sub} /> : null}
    </CelebrateCtx.Provider>
  );
}

function Burst({ title, sub }: { title: string; sub?: string }) {
  const reduced = useReducedMotion();
  const { colors } = useTheme();
  const progress = useSharedValue(0);
  const card = useSharedValue(0);

  useEffect(() => {
    progress.set(withTiming(1, { duration: BURST_MS, easing: Easing.out(Easing.quad) }));
    const settle = reduced
      ? withTiming(1, { duration: 200, easing: EASE_OUT, reduceMotion: ReduceMotion.Never })
      : withSpring(1, { duration: 450, dampingRatio: 0.7 });
    card.set(
      withSequence(settle, withDelay(HOLD_MS + BURST_MS - 650, withTiming(0, { duration: 200, easing: EASE_OUT, reduceMotion: ReduceMotion.Never }))),
    );
  }, [progress, card, reduced]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, card.get() * 1.5),
    transform: reduced ? [] : [{ scale: 0.9 + card.get() * 0.1 }],
  }));

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="celebrate-overlay">
      <View style={styles.center}>
        {!reduced ? Array.from({ length: PIECES }, (_, i) => <Piece key={i} i={i} progress={progress} />) : null}
        <Animated.View style={[styles.card, { backgroundColor: colors.surfaceSecondary }, cardStyle]}>
          <RNText style={[styles.emoji]}>🎉</RNText>
          <RNText style={[styles.title, { color: colors.onSurface }]}>{title}</RNText>
          {sub ? <RNText style={[styles.sub, { color: colors.onSurfaceSecondary }]}>{sub}</RNText> : null}
        </Animated.View>
      </View>
    </View>
  );
}

function Piece({ i, progress }: { i: number; progress: ReturnType<typeof useSharedValue<number>> }) {
  // Deterministic spread so the burst looks designed, not random noise.
  const angle = (i / PIECES) * Math.PI * 2 + (i % 3) * 0.2;
  const dist = 120 + (i % 5) * 28;
  const spin = (i % 2 ? 1 : -1) * (180 + (i % 4) * 90);
  const color = COLORS[i % COLORS.length];
  const w = i % 3 === 0 ? 8 : 6;
  const h = i % 3 === 0 ? 8 : 12;
  const style = useAnimatedStyle(() => {
    const p = progress.get();
    return {
      opacity: p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3,
      transform: [
        { translateX: Math.cos(angle) * dist * p },
        { translateY: Math.sin(angle) * dist * p + 140 * p * p },
        { rotate: `${spin * p}deg` },
      ],
    };
  });
  return <Animated.View style={[styles.piece, { width: w, height: h, borderRadius: i % 3 === 0 ? 4 : 2, backgroundColor: color }, style]} />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  piece: { position: "absolute" },
  card: {
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderRadius: radius.md,
    maxWidth: 320,
    ...cardShadow,
  },
  emoji: { fontSize: 36, marginBottom: 2 },
  title: { ...fonts.bold, fontSize: 20, textAlign: "center" },
  sub: { ...fonts.regular, fontSize: 15, textAlign: "center", lineHeight: 21 },
});
